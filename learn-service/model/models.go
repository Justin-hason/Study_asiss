package model

import "time"

type ErrResp struct {
	Error ErrDetail `json:"error"`
}

type ErrDetail struct {
	Code    string   `json:"code"`
	Message string   `json:"message"`
	Details []string `json:"details,omitempty"`
}

type EventReq struct {
	Events []Event `json:"events"`
}

type Event struct {
	EventType string                 `json:"event_type"`
	Timestamp string                 `json:"timestamp"`
	SessionID string                 `json:"session_id,omitempty"`
	Payload   map[string]interface{} `json:"payload"`
}

type LearningEvent struct {
	EventID   string                 `bson:"event_id" json:"event_id"`
	UserID    string                 `bson:"user_id" json:"user_id"`
	TenantID  string                 `bson:"tenant_id" json:"tenant_id"`
	EventType string                 `bson:"event_type" json:"event_type"`
	Timestamp time.Time              `bson:"timestamp" json:"timestamp"`
	SessionID string                 `bson:"session_id,omitempty" json:"session_id,omitempty"`
	Payload   map[string]interface{} `bson:"payload" json:"payload"`
	CreatedAt time.Time              `bson:"created_at" json:"created_at"`
}

type KnowledgePoint struct {
	ID           string   `json:"id"`
	TenantID     string   `json:"tenant_id"`
	Name         string   `json:"name"`
	ParentID     *string  `json:"parent_id,omitempty"`
	SourceDocIDs []string `json:"source_doc_ids,omitempty"`
}

type UserMastery struct {
	UserID          string    `json:"user_id"`
	KpID            string    `json:"kp_id"`
	Score           float64   `json:"score"`
	LastCalculatedAt time.Time `json:"last_calculated_at"`
	SMark           float64   `json:"s_mark"`
	SQuiz           float64   `json:"s_quiz"`
	SFreq           float64   `json:"s_freq"`
	SRetention      float64   `json:"s_retention"`
	SDepth          float64   `json:"s_depth"`
}

type PushTask struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	KpIDs     []string  `json:"kp_ids"`
	Content   string    `json:"content,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	Status    string    `json:"status"`
}

type MarkMasteryReq struct {
	Level string `json:"level"`
}

type ReviewPackReq struct {
	KpIDs []string `json:"kp_ids,omitempty"`
	Count int      `json:"count,omitempty"`
}

type MasteryResponse struct {
	Items []UserMastery `json:"items"`
	Total int           `json:"total"`
}

type PushTasksResponse struct {
	Items []PushTask `json:"items"`
	Date  string     `json:"date"`
}

type ReviewPackResponse struct {
	PackID  string `json:"pack_id"`
	Content string `json:"content"`
}
