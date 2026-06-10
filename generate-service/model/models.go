package model

import "time"

type ContextItem struct {
	Text   string  `json:"text"`
	Source string  `json:"source"`
	Page   int     `json:"page"`
	Score  float64 `json:"score,omitempty"`
}

type AskRequest struct {
	SessionID string        `json:"session_id"`
	Query     string        `json:"query"`
	Contexts  []ContextItem `json:"contexts"`
	Model     string        `json:"model"`
	Stream    bool          `json:"stream"`
}

type SourceRef struct {
	Source string  `json:"source"`
	Page   int     `json:"page"`
	Score  float64 `json:"score"`
}

type AnswerBody struct {
	Answer    string       `json:"answer"`
	Reasoning string       `json:"reasoning,omitempty"`
	Keywords  []string     `json:"keywords,omitempty"`
	Sources   []SourceRef  `json:"sources"`
}

type AskResponse struct {
	SessionID string     `json:"session_id"`
	Answer    AnswerBody `json:"answer"`
}

type SSEEvent struct {
	Type   string      `json:"type"`
	Content string     `json:"content,omitempty"`
	Result *AskResponse `json:"result,omitempty"`
	Error  string      `json:"error,omitempty"`
}

type ChatMessage struct {
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
}

type SessionHistory struct {
	SessionID string        `json:"session_id"`
	Messages  []ChatMessage `json:"messages"`
}

type HistoryItem struct {
	SessionID string    `json:"session_id"`
	Query     string    `json:"query"`
	Answer    string    `json:"answer"`
	CreatedAt time.Time `json:"created_at"`
	Sources   []SourceRef `json:"sources,omitempty"`
}

type GenerateRequest struct {
	SessionID    string
	Query        string
	Contexts     []ContextItem
	SystemPrompt string
	History      []ChatMessage
	Model        string
	Stream       bool
	Temperature  float64
	MaxTokens    int
}

type StreamChunk struct {
	Content string
	Done    bool
	Error   error
	Result  *AskResponse
}

type GenerateResponse struct {
	Content string
	Sources []SourceRef
	Tokens  int
}

type ModelConfig struct {
	Name        string        `json:"name"`
	Provider    string        `json:"provider"`
	ModelID     string        `json:"model_id"`
	BaseURL     string        `json:"base_url"`
	APIKey      string        `json:"-"`
	Timeout     time.Duration `json:"timeout"`
	MaxTokens   int           `json:"max_tokens"`
	Temperature float64       `json:"temperature"`
	Enabled     bool          `json:"enabled"`
}

type AuditResult struct {
	Passed    bool    `json:"passed"`
	Score     float64 `json:"score"`
	Reason    string  `json:"reason,omitempty"`
}

type ErrorResp struct {
	Error ErrorDetail `json:"error"`
}

type ErrorDetail struct {
	Code    string   `json:"code"`
	Message string   `json:"message"`
	Details []string `json:"details,omitempty"`
}

type HealthStatus struct {
	Status    string            `json:"status"`
	Services  map[string]string `json:"services"`
}
