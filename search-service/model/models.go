package model

type SearchRequest struct {
	Query     string  `json:"query"`
	TenantID  string  `json:"tenant_id"`
	TopK      int     `json:"top_k"`
	TopN      int     `json:"top_n"`
	Alpha     float64 `json:"alpha"`
	Threshold float64 `json:"threshold"`
}

type SearchResponse struct {
	Results     []ChunkResult `json:"results"`
	EmptyResult bool          `json:"empty_result"`
	LatencyMs   int64         `json:"latency_ms"`
}

type ChunkResult struct {
	ChunkID     string  `json:"chunk_id"`
	DocID       string  `json:"doc_id,omitempty"`
	DocName     string  `json:"doc_name"`
	Page        int     `json:"page"`
	Text        string  `json:"text"`
	Score       float64 `json:"score"`
	VectorScore float64 `json:"vector_score,omitempty"`
	BM25Score   float64 `json:"bm25_score,omitempty"`
}

type MilvusHealthResponse struct {
	Status        string `json:"status"`
	HasCollection bool   `json:"has_collection"`
	Partitions    int    `json:"partitions"`
	IndexStatus   string `json:"index_status"`
}

type ESHealthResponse struct {
	Status      string `json:"status"`
	ClusterName string `json:"cluster_name"`
	IndexExists bool   `json:"index_exists"`
	DocsCount   int64  `json:"docs_count"`
}

type RerankerHealthResponse struct {
	Status string `json:"status"`
}

type ErrorResp struct {
	Error ErrorDetail `json:"error"`
}

type ErrorDetail struct {
	Code    string   `json:"code"`
	Message string   `json:"message"`
	Details []string `json:"details,omitempty"`
}
