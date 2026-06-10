package prompt

import (
	"fmt"
	"strings"

	"generate-service/model"
)

const systemPrompt = `你是一个严格遵循参考材料的智能学习助手。你的回答必须遵守以下规则：

## 核心规则
1. 你只能根据下面提供的"参考材料"来回答问题。
2. 如果参考材料中有相关内容，请基于材料给出准确、详细的回答。
3. 如果参考材料中没有足够的信息来回答问题，你必须回答："根据提供的参考资料，无法找到相关答案。"
4. 严禁使用你自身预训练知识来回答。严禁捏造或编造信息。
5. 严禁出现"根据我的知识"、"据我所知"、"基于我的理解"等表述。

## 输出格式要求
- 每个重要观点必须在末尾标注来源编号，格式为【来源N, 第X页】。
- 如果参考材料包含多个来源段落，请用编号引用。
- 回答应结构清晰，包含：核心解答、详细解析、关键知识点。`

const emptyContextResponse = "根据提供的参考资料，无法找到相关答案。"

func BuildSystemPrompt() string {
	return systemPrompt
}

func BuildUserPrompt(query string, contexts []model.ContextItem) string {
	if len(contexts) == 0 {
		return query
	}

	var sb strings.Builder
	sb.WriteString("## 参考材料\n")
	sb.WriteString("以下是检索到的参考资料，请严格基于这些材料回答问题：\n\n")

	for i, ctx := range contexts {
		sb.WriteString(fmt.Sprintf("### 来源%d", i+1))
		if ctx.Source != "" {
			sb.WriteString(fmt.Sprintf("（%s", ctx.Source))
			if ctx.Page > 0 {
				sb.WriteString(fmt.Sprintf(", 第%d页", ctx.Page))
			}
			sb.WriteString("）")
		}
		sb.WriteString("\n")
		sb.WriteString(ctx.Text)
		sb.WriteString("\n\n")
	}

	sb.WriteString("## 用户问题\n")
	sb.WriteString(query)
	return sb.String()
}

func ValidateEmptyContext(ctxs []model.ContextItem) bool {
	return len(ctxs) == 0
}

func EmptyContextResponse() string {
	return emptyContextResponse
}
