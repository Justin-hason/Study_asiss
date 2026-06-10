package search

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/milvus-io/milvus-sdk-go/v2/client"
	"github.com/milvus-io/milvus-sdk-go/v2/entity"

	"search-service/metrics"
	"search-service/model"
)

type MilvusStore struct {
	client client.Client
}

const milvusCollection = "doc_chunks"

func NewMilvusStore(ctx context.Context, addr string) (*MilvusStore, error) {
	c, err := client.NewDefaultGrpcClientWithURI(ctx, addr)
	if err != nil {
		return nil, fmt.Errorf("milvus connect: %w", err)
	}
	log.Printf("[milvus] connected to %s", addr)
	return &MilvusStore{client: c}, nil
}

func (m *MilvusStore) Close() {
	m.client.Close()
}

func (m *MilvusStore) Search(ctx context.Context, queryVector []float32, tenantID string, topK int) ([]*model.ChunkResult, error) {
	start := time.Now()
	defer func() {
		metrics.MilvusQueryDuration.Observe(time.Since(start).Seconds())
	}()

	partitionName := fmt.Sprintf("tenant_%s", tenantID)

	sp, err := entity.NewIndexSearchParam(entity.COSINE)
	if err != nil {
		return nil, fmt.Errorf("milvus search param: %w", err)
	}
	sp.AddIndex(entity.COSINE, 16)

	searchResult, err := m.client.Search(
		ctx,
		milvusCollection,
		[]string{partitionName},
		"",
		[]string{"chunk_id", "doc_id", "doc_name", "page_number", "chunk_text"},
		[]entity.Vector{entity.FloatVector(queryVector)},
		"embedding",
		entity.COSINE,
		topK,
		sp,
	)
	if err != nil {
		return nil, fmt.Errorf("milvus search: %w", err)
	}
	if len(searchResult) == 0 {
		return nil, nil
	}

	results := make([]*model.ChunkResult, 0, topK)
	for _, sr := range searchResult {
		for i := 0; i < sr.ResultCount; i++ {
			chunk := &model.ChunkResult{
				VectorScore: float64(sr.Scores[i]),
				Score:       float64(sr.Scores[i]),
			}
			for _, field := range sr.Fields {
				switch field.Name() {
				case "chunk_id":
					if col, ok := field.(*entity.ColumnVarChar); ok {
						chunk.ChunkID = col.Data()[i]
					}
				case "doc_id":
					if col, ok := field.(*entity.ColumnVarChar); ok {
						chunk.DocID = col.Data()[i]
					}
				case "doc_name":
					if col, ok := field.(*entity.ColumnVarChar); ok {
						chunk.DocName = col.Data()[i]
					}
				case "page_number":
					if col, ok := field.(*entity.ColumnInt64); ok {
						chunk.Page = int(col.Data()[i])
					}
				case "chunk_text":
					if col, ok := field.(*entity.ColumnVarChar); ok {
						chunk.Text = col.Data()[i]
					}
				}
			}
			results = append(results, chunk)
		}
	}
	return results, nil
}

func (m *MilvusStore) Health(ctx context.Context) (*model.MilvusHealthResponse, error) {
	resp := &model.MilvusHealthResponse{Status: "ok"}
	has, err := m.client.HasCollection(ctx, milvusCollection)
	if err != nil {
		resp.Status = "error"
		return resp, fmt.Errorf("milvus health: %w", err)
	}
	resp.HasCollection = has
	if !has {
		return resp, nil
	}
	partitions, err := m.client.ShowPartitions(ctx, milvusCollection)
	if err == nil {
		resp.Partitions = len(partitions)
	}
	indexStatus, err := m.client.GetIndexState(ctx, milvusCollection, "")
	if err == nil {
		resp.IndexStatus = indexStatus.String()
	}
	return resp, nil
}
