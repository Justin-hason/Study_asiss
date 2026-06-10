package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"generate-service/model"
)

type OpenAIClient struct {
	cfg model.ModelConfig
}

func NewOpenAIClient(cfg model.ModelConfig) *OpenAIClient {
	return &OpenAIClient{cfg: cfg}
}

type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIRequest struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Temperature float64         `json:"temperature,omitempty"`
	Stream      bool            `json:"stream,omitempty"`
}

type openAIChoice struct {
	Index        int            `json:"index"`
	Delta        openAIDelta    `json:"delta,omitempty"`
	Message      openAIMessage  `json:"message,omitempty"`
	FinishReason string         `json:"finish_reason,omitempty"`
}

type openAIDelta struct {
	Content string `json:"content,omitempty"`
}

type openAIResponse struct {
	ID      string         `json:"id"`
	Object  string         `json:"object"`
	Choices []openAIChoice `json:"choices"`
	Usage   *struct {
		TotalTokens int `json:"total_tokens"`
	} `json:"usage,omitempty"`
}

type openAIStreamChunk struct {
	ID      string         `json:"id"`
	Object  string         `json:"object"`
	Choices []openAIChoice `json:"choices"`
}

func buildOpenAIMessages(req model.GenerateRequest) []openAIMessage {
	var messages []openAIMessage
	messages = append(messages, openAIMessage{Role: "system", Content: req.SystemPrompt})
	for _, h := range req.History {
		messages = append(messages, openAIMessage{Role: h.Role, Content: h.Content})
	}
	messages = append(messages, openAIMessage{Role: "user", Content: req.Query})
	return messages
}

func (c *OpenAIClient) Generate(ctx context.Context, req model.GenerateRequest) (*model.GenerateResponse, error) {
	body := openAIRequest{
		Model:       c.cfg.ModelID,
		Messages:    buildOpenAIMessages(req),
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
		Stream:      false,
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.cfg.BaseURL+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("api call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("api error %d: %s", resp.StatusCode, string(respBody))
	}

	var openAIResp openAIResponse
	if err := json.NewDecoder(resp.Body).Decode(&openAIResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if len(openAIResp.Choices) == 0 {
		return nil, fmt.Errorf("empty response choices")
	}

	content := openAIResp.Choices[0].Message.Content
	tokens := 0
	if openAIResp.Usage != nil {
		tokens = openAIResp.Usage.TotalTokens
	}

	sources := extractSources(content, req.Contexts)
	return &model.GenerateResponse{
		Content: content,
		Sources: sources,
		Tokens:  tokens,
	}, nil
}

func (c *OpenAIClient) GenerateStream(ctx context.Context, req model.GenerateRequest) (<-chan model.StreamChunk, error) {
	ch := make(chan model.StreamChunk, 64)

	body := openAIRequest{
		Model:       c.cfg.ModelID,
		Messages:    buildOpenAIMessages(req),
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
		Stream:      true,
	}

	payload, err := json.Marshal(body)
	if err != nil {
		close(ch)
		return ch, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.cfg.BaseURL+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		close(ch)
		return ch, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	httpReq.Header.Set("Accept", "text/event-stream")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		close(ch)
		return ch, fmt.Errorf("api call: %w", err)
	}

	go func() {
		defer resp.Body.Close()
		defer close(ch)

		if resp.StatusCode != 200 {
			respBody, _ := io.ReadAll(resp.Body)
			ch <- model.StreamChunk{Error: fmt.Errorf("api error %d: %s", resp.StatusCode, string(respBody))}
			return
		}

		scanner := bufio.NewScanner(resp.Body)
		var fullContent strings.Builder

		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				break
			}

			var chunk openAIStreamChunk
			if err := json.Unmarshal([]byte(data), &chunk); err != nil {
				continue
			}

			for _, choice := range chunk.Choices {
				if choice.Delta.Content != "" {
					fullContent.WriteString(choice.Delta.Content)
					ch <- model.StreamChunk{Content: choice.Delta.Content}
				}
				if choice.FinishReason == "stop" {
					sources := extractSources(fullContent.String(), req.Contexts)
					ch <- model.StreamChunk{
						Done: true,
						Result: &model.AskResponse{
							SessionID: req.SessionID,
							Answer: model.AnswerBody{
								Answer:  fullContent.String(),
								Sources: sources,
							},
						},
					}
				}
			}
		}

		if err := scanner.Err(); err != nil {
			ch <- model.StreamChunk{Error: fmt.Errorf("stream read: %w", err)}
		}
	}()

	return ch, nil
}

func extractSources(content string, contexts []model.ContextItem) []model.SourceRef {
	var sources []model.SourceRef
	seen := make(map[string]bool)
	for _, ctx := range contexts {
		if strings.Contains(content, ctx.Source) || strings.Contains(content, fmt.Sprintf("[%d]", ctx.Page)) {
			key := fmt.Sprintf("%s:%d", ctx.Source, ctx.Page)
			if !seen[key] {
				sources = append(sources, model.SourceRef{
					Source: ctx.Source,
					Page:   ctx.Page,
					Score:  ctx.Score,
				})
				seen[key] = true
			}
		}
	}
	return sources
}
