package model

import "time"

type ReviewStatus string

const (
	ReviewPending  ReviewStatus = "pending"
	ReviewApproved ReviewStatus = "approved"
	ReviewRejected ReviewStatus = "rejected"
)

type PendingDocument struct {
	ID          string       `json:"id"`
	TenantID    string       `json:"tenant_id"`
	Name        string       `json:"name"`
	FileType    string       `json:"file_type"`
	FileSize    int64        `json:"file_size"`
	UploaderID  string       `json:"uploader_id"`
	UploaderName string      `json:"uploader_name,omitempty"`
	Status      ReviewStatus `json:"status"`
	ContentSnippet string    `json:"content_snippet,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}

type ReviewActionReq struct {
	Action string `json:"action"`
	Reason string `json:"reason,omitempty"`
}

type SystemConfig struct {
	ID           string    `json:"id"`
	Key          string    `json:"key"`
	Value        string    `json:"value"`
	Description  string    `json:"description,omitempty"`
	UpdatedBy    string    `json:"updated_by"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type UpdateConfigReq struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description,omitempty"`
}

type SystemStats struct {
	Services          map[string]string `json:"services"`
	TotalDocuments    int64             `json:"total_documents"`
	PendingReviews    int64             `json:"pending_reviews"`
	ActiveUsers       int64             `json:"active_users"`
	TotalQueries      int64             `json:"total_queries"`
	IndexSize         string            `json:"index_size"`
	StorageUsed       string            `json:"storage_used"`
	UptimeSeconds     int64             `json:"uptime_seconds"`
}

type HealthResponse struct {
	Status   string            `json:"status"`
	Services map[string]string `json:"services"`
}

type IndexRebuildResp struct {
	Status   string `json:"status"`
	Message  string `json:"message"`
}

type SensitiveWordCheck struct {
	Content  string   `json:"content"`
	Found    bool     `json:"found"`
	Words    []string `json:"words,omitempty"`
}

type ErrorResp struct {
	Error ErrorDetail `json:"error"`
}

type ErrorDetail struct {
	Code    string   `json:"code"`
	Message string   `json:"message"`
	Details []string `json:"details,omitempty"`
}
