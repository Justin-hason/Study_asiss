package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	SearchRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "search_requests_total",
			Help: "Total search requests by tenant and status",
		},
		[]string{"tenant_id", "status"},
	)

	SearchLatencySeconds = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "search_latency_seconds",
			Help:    "Search latency in seconds",
			Buckets: prometheus.ExponentialBuckets(0.005, 2, 10),
		},
		[]string{"tenant_id"},
	)

	MilvusQueryDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "milvus_query_duration_seconds",
			Help:    "Milvus vector search duration in seconds",
			Buckets: prometheus.ExponentialBuckets(0.001, 2, 10),
		},
	)

	ESQueryDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "es_query_duration_seconds",
			Help:    "Elasticsearch BM25 search duration in seconds",
			Buckets: prometheus.ExponentialBuckets(0.001, 2, 10),
		},
	)

	RerankDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "rerank_duration_seconds",
			Help:    "Cross-Encoder rerank duration in seconds",
			Buckets: prometheus.ExponentialBuckets(0.01, 2, 10),
		},
	)

	EmbeddingDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "embedding_duration_seconds",
			Help:    "Embedding service call duration in seconds",
			Buckets: prometheus.ExponentialBuckets(0.01, 2, 10),
		},
	)
)
