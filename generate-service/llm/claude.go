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

type ClaudeClient struct {
	cfg model.ModelConfig
}

func NewClaudeClient(cfg model.ModelConfig) *ClaudeClient {
	return &ClaudeClient{cfg: cfg}
}

type claudeMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type claudeRequest struct {
	Model       string          `json:"model"`
	Messages    []claudeMessage `json:"messages"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Temperature float64         `json:"temperature,omitempty"`
	System      string          `json:"system,omitempty"`
	Stream      bool            `json:"stream,omitempty"`
}

type claudeContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type claudeDelta struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type claudeStreamEvent struct {
	Type  string          `json:"type"`
	Index int             `json:"index,omitempty"`
	Delta *claudeDelta    `json:"delta,omitempty"`
	ContentBlock *claudeContentBlock `json:"content_block,omitempty"`
}

type claudeResponse struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Role    string `json:"role"`
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Usage *struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage,omitempty"`
}

func buildClaudeMessages(req model.GenerateRequest) []claudeMessage {
	var messages []claudeMessage
	for _, h := range req.History {
		role := h.Role
		if role != "user" && role != "assistant" {
			continue
		}
		messages = append(messages, claudeMessage{Role: role, Content: h.Content})
	}
	messages = append(messages, claudeMessage{Role: "user", Content: req.Query})
	return messages
}

func (c *ClaudeClient) Generate(ctx context.Context, req model.GenerateRequest) (*model.GenerateResponse, error) {
	body := claudeRequest{
		Model:       c.cfg.ModelID,
		Messages:    buildClaudeMessages(req),
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
		System:      req.SystemPrompt,
		Stream:      false,
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.cfg.BaseURL+"/messages", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", c.cfg.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("api call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("api error %d: %s", resp.StatusCode, string(respBody))
	}

	var claudeResp claudeResponse
	if err := json.NewDecoder(resp.Body).Decode(&claudeResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	content := ""
	for _, block := range claudeResp.Content {
		if block.Type == "text" {
			content += block.Text
		}
	}

	tokens := 0
	if claudeResp.Usage != nil {
		tokens = claudeResp.Usage.InputTokens + claudeResp.Usage.OutputTokens
	}

	sources := extractSources(content, req.Contexts)
	return &model.GenerateResponse{
		Content: content,
		Sources: sources,
		Tokens:  tokens,
	}, nil
}

func (c *ClaudeClient) GenerateStream(ctx context.Context, req model.GenerateRequest) (<-chan model.StreamChunk, error) {
	ch := make(chan model.StreamChunk, 64)

	body := claudeRequest{
		Model:       c.cfg.ModelID,
		Messages:    buildClaudeMessages(req),
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
		System:      req.SystemPrompt,
		Stream:      true,
	}

	payload, err := json.Marshal(body)
	if err != nil {
		close(ch)
		return ch, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.cfg.BaseURL+"/messages", bytes.NewReader(payload))
	if err != nil {
		close(ch)
		return ch, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", c.cfg.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

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

			var event claudeStreamEvent
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				continue
			}

			switch event.Type {
			case "content_block_delta":
				if event.Delta != nil && event.Delta.Text != "" {
					fullContent.WriteString(event.Delta.Text)
					ch <- model.StreamChunk{Content: event.Delta.Text}
				}
			case "content_block_stop":
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

		if err := scanner.Err(); err != nil {
			ch <- model.StreamChunk{Error: fmt.Errorf("stream read: %w", err)}
		}
	}()

	return ch, nil
}
