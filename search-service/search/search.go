package search

import (
	"context"
	"log"
	"sync"
	"time"

	"search-service/config"
	"search-service/metrics"
	"search-service/model"
)

type Service struct {
	milvus   *MilvusStore
	es       *ESStore
	embedder *Embedder
	reranker *Reranker
	cfg      *config.Config
}

func NewService(cfg *config.Config) (*Service, error) {
	ctx := context.Background()

	milvusStore, err := NewMilvusStore(ctx, cfg.MilvusAddr)
	if err != nil {
		return nil, err
	}

	esStore := NewESStore(cfg.ESAddr)
	embedder := NewEmbedder(cfg.EmbeddingServiceURL)
	reranker := NewReranker(cfg.RerankerServiceURL)

	return &Service{
		milvus:   milvusStore,
		es:       esStore,
		embedder: embedder,
		reranker: reranker,
		cfg:      cfg,
	}, nil
}

func (s *Service) Close() {
	s.milvus.Close()
}

func (s *Service) Search(ctx context.Context, req *model.SearchRequest) (*model.SearchResponse, error) {
	start := time.Now()
	tenantID := req.TenantID

	topK := s.cfg.DefaultTopK
	if req.TopK > 0 {
		topK = req.TopK
	}
	topN := s.cfg.DefaultTopN
	if req.TopN > 0 {
		topN = req.TopN
	}
	threshold := s.cfg.DefaultThreshold
	if req.Threshold > 0 {
		threshold = req.Threshold
	}

	log.Printf("[search] query=%q tenant=%s top_k=%d top_n=%d", req.Query, tenantID, topK, topN)

	queryVector, err := s.embedder.Embed(ctx, req.Query)
	if err != nil {
		log.Printf("[search] embedding error: %v", err)
		metrics.SearchRequestsTotal.WithLabelValues(tenantID, "error").Inc()
		return nil, err
	}
	log.Printf("[search] embedding done, dim=%d", len(queryVector))

	var vecResults, bm25Results []*model.ChunkResult
	var vecErr, bm25Err error
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		vecResults, vecErr = s.milvus.Search(ctx, queryVector, tenantID, topK)
	}()
	go func() {
		defer wg.Done()
		bm25Results, bm25Err = s.es.Search(ctx, req.Query, tenantID, topK)
	}()
	wg.Wait()

	if vecErr != nil {
		log.Printf("[search] milvus error: %v", vecErr)
	}
	if bm25Err != nil {
		log.Printf("[search] es error: %v", bm25Err)
	}
	if vecErr != nil && bm25Err != nil {
		metrics.SearchRequestsTotal.WithLabelValues(tenantID, "error").Inc()
		return nil, vecErr
	}

	log.Printf("[search] milvus=%d bm25=%d results", len(vecResults), len(bm25Results))

	fused := RRF(vecResults, bm25Results, s.cfg.RRFK)
	if len(fused) > s.cfg.RRFM {
		fused = fused[:s.cfg.RRFM]
	}
	log.Printf("[search] rrf fused=%d candidates", len(fused))

	passages := make([]string, 0, len(fused))
	for _, r := range fused {
		passages = append(passages, r.Text)
	}

	var rerankScores []float64
	if len(passages) > 0 {
		rerankScores, err = s.reranker.Rerank(ctx, req.Query, passages)
		if err != nil {
			log.Printf("[search] reranker error (will use fusion scores): %v", err)
		}
	}

	results := s.applyRerankAndFilter(fused, rerankScores, threshold, topN)

	latency := time.Since(start).Milliseconds()
	status := "success"
	if len(results) == 0 {
		status = "empty"
	}
	metrics.SearchRequestsTotal.WithLabelValues(tenantID, status).Inc()
	metrics.SearchLatencySeconds.WithLabelValues(tenantID).Observe(float64(latency) / 1000.0)

	resp := &model.SearchResponse{
		Results:   results,
		EmptyResult: len(results) == 0,
		LatencyMs: latency,
	}

	log.Printf("[search] done latency=%dms results=%d", latency, len(results))
	return resp, nil
}

func (s *Service) applyRerankAndFilter(fused []*model.ChunkResult, rerankScores []float64, threshold float64, topN int) []*model.ChunkResult {
	filtered := make([]*model.ChunkResult, 0, len(fused))

	for i, r := range fused {
		score := r.Score
		if rerankScores != nil && i < len(rerankScores) {
			score = rerankScores[i]
			r.Score = score
		}
		if score >= threshold {
			filtered = append(filtered, r)
		}
	}

	if len(filtered) > topN {
		filtered = filtered[:topN]
	}

	return filtered
}

func (s *Service) MilvusHealth(ctx context.Context) (*model.MilvusHealthResponse, error) {
	return s.milvus.Health(ctx)
}

func (s *Service) ESHealth(ctx context.Context) (*model.ESHealthResponse, error) {
	return s.es.Health(ctx)
}

func (s *Service) RerankerHealth(ctx context.Context) (*model.RerankerHealthResponse, error) {
	resp := &model.RerankerHealthResponse{Status: "ok"}
	if err := s.reranker.Health(ctx); err != nil {
		resp.Status = "error"
		return resp, err
	}
	return resp, nil
}
