package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"search-service/metrics"
	"search-service/model"
)

type ESStore struct {
	addr   string
	client *http.Client
}

const esIndex = "doc_chunks"

type esSearchBody struct {
	Query esBoolQuery `json:"query"`
	Size  int         `json:"size"`
}

type esBoolQuery struct {
	Bool esMustFilter `json:"bool"`
}

type esMustFilter struct {
	Must   []esMatchQuery `json:"must"`
	Filter []esTermFilter `json:"filter"`
}

type esMatchQuery struct {
	Match map[string]string `json:"match"`
}

type esTermFilter struct {
	Term map[string]string `json:"term"`
}

type esSearchResponse struct {
	Hits esHits `json:"hits"`
}

type esHits struct {
	Total esTotal    `json:"total"`
	Hits  []esHit   `json:"hits"`
}

type esTotal struct {
	Value int `json:"value"`
}

type esHit struct {
	Score  float64        `json:"_score"`
	Source esChunkDoc     `json:"_source"`
}

type esChunkDoc struct {
	ChunkID  string `json:"chunk_id"`
	DocID    string `json:"doc_id"`
	DocName  string `json:"doc_name"`
	ChunkText string `json:"chunk_text"`
	PageNumber int   `json:"page_number"`
}

func NewESStore(addr string) *ESStore {
	return &ESStore{
		addr: addr,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (e *ESStore) Search(ctx context.Context, query, tenantID string, topK int) ([]*model.ChunkResult, error) {
	start := time.Now()
	defer func() {
		metrics.ESQueryDuration.Observe(time.Since(start).Seconds())
	}()

	body := esSearchBody{
		Query: esBoolQuery{
			Bool: esMustFilter{
				Must: []esMatchQuery{
					{Match: map[string]string{"chunk_text": query}},
				},
				Filter: []esTermFilter{
					{Term: map[string]string{"tenant_id": tenantID}},
				},
			},
		},
		Size: topK,
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("es marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST",
		e.addr+"/"+esIndex+"/_search", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("es request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("es do: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("es read: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("es status %d: %s", resp.StatusCode, string(respBody))
	}

	var searchResp esSearchResponse
	if err := json.Unmarshal(respBody, &searchResp); err != nil {
		return nil, fmt.Errorf("es unmarshal: %w", err)
	}

	results := make([]*model.ChunkResult, 0, len(searchResp.Hits.Hits))
	for _, hit := range searchResp.Hits.Hits {
		results = append(results, &model.ChunkResult{
			ChunkID:   hit.Source.ChunkID,
			DocID:     hit.Source.DocID,
			DocName:   hit.Source.DocName,
			Text:      hit.Source.ChunkText,
			Page:      hit.Source.PageNumber,
			BM25Score: hit.Score,
			Score:     hit.Score,
		})
	}
	return results, nil
}

func (e *ESStore) Health(ctx context.Context) (*model.ESHealthResponse, error) {
	resp := &model.ESHealthResponse{Status: "ok"}

	req, err := http.NewRequestWithContext(ctx, "GET", e.addr+"/_cluster/health", nil)
	if err != nil {
		resp.Status = "error"
		return resp, err
	}
	r, err := e.client.Do(req)
	if err != nil {
		resp.Status = "error"
		return resp, fmt.Errorf("es cluster health: %w", err)
	}
	defer r.Body.Close()

	var clusterHealth struct {
		ClusterName string `json:"cluster_name"`
		Status      string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&clusterHealth); err == nil {
		resp.ClusterName = clusterHealth.ClusterName
		if clusterHealth.Status != "green" && clusterHealth.Status != "yellow" {
			resp.Status = "degraded"
		}
	}

	checkReq, _ := http.NewRequestWithContext(ctx, "GET", e.addr+"/"+esIndex+"/_count", nil)
	cr, err := e.client.Do(checkReq)
	if err == nil {
		defer cr.Body.Close()
		if cr.StatusCode == http.StatusOK {
			resp.IndexExists = true
			var countResp struct {
				Count int64 `json:"count"`
			}
			json.NewDecoder(cr.Body).Decode(&countResp)
			resp.DocsCount = countResp.Count
		}
	}

	log.Printf("[es] health: status=%s cluster=%s index_exists=%v docs=%d",
		resp.Status, resp.ClusterName, resp.IndexExists, resp.DocsCount)
	return resp, nil
}
