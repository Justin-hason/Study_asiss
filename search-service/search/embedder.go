package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"search-service/metrics"
)

type Embedder struct {
	url    string
	client *http.Client
}

type embedRequest struct {
	Text string `json:"text"`
}

type embedResponse struct {
	Vector []float32 `json:"vector"`
}

func NewEmbedder(url string) *Embedder {
	return &Embedder{
		url: url,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (e *Embedder) Embed(ctx context.Context, text string) ([]float32, error) {
	start := time.Now()
	defer func() {
		metrics.EmbeddingDuration.Observe(time.Since(start).Seconds())
	}()

	reqBody := embedRequest{Text: text}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("embed marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", e.url+"/embed", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("embed request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embed call: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("embed read: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embed status %d: %s", resp.StatusCode, string(body))
	}

	var result embedResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("embed unmarshal: %w", err)
	}

	if len(result.Vector) == 0 {
		return nil, fmt.Errorf("embed returned empty vector")
	}

	return result.Vector, nil
}
