package audit

import (
	"strings"

	"generate-service/model"
)

type Auditor struct {
	minSimilarity float64
}

func NewAuditor(minSimilarity float64) *Auditor {
	return &Auditor{minSimilarity: minSimilarity}
}

func (a *Auditor) Audit(response string, contexts []model.ContextItem) model.AuditResult {
	if len(contexts) == 0 {
		return model.AuditResult{
			Passed: false,
			Score:  0,
			Reason: "empty context, should have been rejected earlier",
		}
	}

	if reasons := a.checkViolations(response); len(reasons) > 0 {
		return model.AuditResult{
			Passed: false,
			Score:  0,
			Reason: strings.Join(reasons, "; "),
		}
	}

	score := a.computeSemanticScore(response, contexts)

	if score < a.minSimilarity {
		return model.AuditResult{
			Passed: false,
			Score:  score,
			Reason: "semantic similarity below threshold",
		}
	}

	return model.AuditResult{
		Passed: true,
		Score:  score,
	}
}

var hallucinationPatterns = []string{
	"根据我的知识",
	"据我所知",
	"基于我的理解",
	"根据我",
	"在我的知识范围内",
	"我了解到",
	"我知道",
	"我认为",
	"我个人",
	"我不确定",
	"我猜测",
	"我推测",
	"可能需要",
	"可能是指",
}

var knowledgePhrases = []string{
	"根据提供的参考资料",
	"根据参考资料",
	"根据参考材料",
	"根据材料",
	"【来源",
	"来源",
	"参考资料显示",
	"参考材料显示",
	"根据上述材料",
	"如上所述",
}

func (a *Auditor) checkViolations(response string) []string {
	var reasons []string

	lower := strings.ToLower(response)

	for _, p := range hallucinationPatterns {
		if strings.Contains(lower, p) {
			reasons = append(reasons, "contains hallucination pattern: '"+p+"'")
			break
		}
	}

	hasCitation := false
	for _, p := range knowledgePhrases {
		if strings.Contains(lower, p) {
			hasCitation = true
			break
		}
	}

	if !hasCitation && len(response) > 50 {
		reasons = append(reasons, "no citation markers found in response")
	}

	return reasons
}

func (a *Auditor) computeSemanticScore(response string, contexts []model.ContextItem) float64 {
	responseWords := tokenize(response)
	if len(responseWords) == 0 {
		return 0
	}

	var maxScore float64
	for _, ctx := range contexts {
		ctxWords := tokenize(ctx.Text)
		score := jaccardSimilarity(responseWords, ctxWords)
		if score > maxScore {
			maxScore = score
		}
	}

	return maxScore
}

func tokenize(text string) map[string]int {
	words := strings.Fields(strings.ToLower(text))
	result := make(map[string]int, len(words))
	for _, w := range words {
		w = strings.Trim(w, ".,;:!?\"'()[]{}【】「」")
		if len(w) > 1 {
			result[w]++
		}
	}
	return result
}

func jaccardSimilarity(a, b map[string]int) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}

	intersection := 0
	for k := range a {
		if _, ok := b[k]; ok {
			intersection++
		}
	}

	union := make(map[string]bool)
	for k := range a {
		union[k] = true
	}
	for k := range b {
		union[k] = true
	}

	if len(union) == 0 {
		return 0
	}

	return float64(intersection) / float64(len(union))
}
