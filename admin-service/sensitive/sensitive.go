package sensitive

import (
	"strings"

	"admin-service/model"
)

type Filter struct {
	words []string
}

func NewFilter(words []string) *Filter {
	return &Filter{words: words}
}

func (f *Filter) Check(content string) model.SensitiveWordCheck {
	if len(f.words) == 0 {
		return model.SensitiveWordCheck{Content: content, Found: false}
	}
	lower := strings.ToLower(content)
	var found []string
	for _, w := range f.words {
		if w == "" {
			continue
		}
		if strings.Contains(lower, strings.ToLower(w)) {
			found = append(found, w)
		}
	}
	return model.SensitiveWordCheck{
		Content: content,
		Found:   len(found) > 0,
		Words:   found,
	}
}

func (f *Filter) Replace(content string, replacement string) string {
	if replacement == "" {
		replacement = "***"
	}
	result := content
	for _, w := range f.words {
		if w == "" {
			continue
		}
		result = strings.ReplaceAll(strings.ToLower(result), strings.ToLower(w), replacement)
	}
	return result
}

func (f *Filter) AddWord(word string) {
	for _, w := range f.words {
		if strings.EqualFold(w, word) {
			return
		}
	}
	f.words = append(f.words, word)
}
