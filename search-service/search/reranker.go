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

type Reranker struct {
	url    string
	client *http.Client
}

type rerankRequest struct {
	Query    string   `json:"query"`
	Passages []string `json:"passages"`
}

type rerankResponse struct {
	Scores []float64 `json:"scores"`
}

func NewReranker(url string) *Reranker {
	return &Reranker{
		url: url,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (r *Reranker) Rerank(ctx context.Context, query string, passages []string) ([]float64, error) {
	if len(passages) == 0 {
		return nil, nil
	}

	start := time.Now()
	defer func() {
		metrics.RerankDuration.Observe(time.Since(start).Seconds())
	}()

	reqBody := rerankRequest{
		Query:    query,
		Passages: passages,
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("rerank marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", r.url+"/rerank", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("rerank request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("rerank call: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("rerank read: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("rerank status %d: %s", resp.StatusCode, string(body))
	}

	var result rerankResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("rerank unmarshal: %w", err)
	}

	return result.Scores, nil
}

func (r *Reranker) Health(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, "GET", r.url+"/health", nil)
	if err != nil {
		return err
	}
	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("reranker health: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("reranker health status %d", resp.StatusCode)
	}
	return nil
}
