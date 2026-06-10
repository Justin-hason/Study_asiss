package store

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"

	"admin-service/model"
)

type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(dsn string) (*PostgresStore, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	db.SetMaxOpenConns(50)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(10 * time.Minute)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return &PostgresStore{db: db}, nil
}

func (s *PostgresStore) Close() error {
	return s.db.Close()
}

func (s *PostgresStore) Ping() error {
	return s.db.Ping()
}

func (s *PostgresStore) RunMigrations() error {
	queries := []string{
		`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
		`CREATE TABLE IF NOT EXISTS review_queue (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			doc_id UUID NOT NULL,
			tenant_id VARCHAR(64) NOT NULL,
			status VARCHAR(32) NOT NULL DEFAULT 'pending',
			reviewer_id VARCHAR(64) DEFAULT '',
			review_reason TEXT DEFAULT '',
			content_snippet TEXT DEFAULT '',
			submitted_at TIMESTAMPTZ DEFAULT NOW(),
			reviewed_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS system_configs (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			key VARCHAR(256) NOT NULL UNIQUE,
			value TEXT NOT NULL,
			description TEXT DEFAULT '',
			updated_by VARCHAR(64) DEFAULT '',
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS sensitive_words (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			word VARCHAR(256) NOT NULL UNIQUE,
			created_by VARCHAR(64) DEFAULT '',
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS index_jobs (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			triggered_by VARCHAR(64) NOT NULL,
			status VARCHAR(32) NOT NULL DEFAULT 'pending',
			started_at TIMESTAMPTZ,
			completed_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status)`,
		`CREATE INDEX IF NOT EXISTS idx_review_queue_tenant ON review_queue(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_system_configs_key ON system_configs(key)`,
		`CREATE INDEX IF NOT EXISTS idx_index_jobs_status ON index_jobs(status)`,
	}
	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return fmt.Errorf("migration: %w", err)
		}
	}
	return nil
}

func (s *PostgresStore) GetPendingDocuments(tenantID string, page, pageSize int) ([]*model.PendingDocument, int64, error) {
	offset := (page - 1) * pageSize

	var total int64
	countQuery := `SELECT COUNT(*) FROM review_queue WHERE status = 'pending'`
	args := []interface{}{}
	if tenantID != "" {
		countQuery += ` AND tenant_id = $1`
		args = append(args, tenantID)
	}
	if err := s.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count pending: %w", err)
	}

	query := `SELECT r.id, r.doc_id, r.tenant_id, r.status, r.content_snippet, r.submitted_at, r.created_at, r.updated_at,
		COALESCE(d.name, ''), COALESCE(d.file_type, ''), COALESCE(d.file_size, 0), COALESCE(d.uploader_id, '')
		FROM review_queue r
		LEFT JOIN documents d ON d.id = r.doc_id
		WHERE r.status = 'pending'`
	queryArgs := []interface{}{}
	argIdx := 1
	if tenantID != "" {
		query += fmt.Sprintf(` AND r.tenant_id = $%d`, argIdx)
		queryArgs = append(queryArgs, tenantID)
		argIdx++
	}
	query += ` ORDER BY r.submitted_at ASC`
	query += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
	queryArgs = append(queryArgs, pageSize, offset)

	rows, err := s.db.Query(query, queryArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("query pending: %w", err)
	}
	defer rows.Close()

	var docs []*model.PendingDocument
	for rows.Next() {
		d := &model.PendingDocument{}
		var contentSnippet, status sql.NullString
		if err := rows.Scan(&d.ID, &d.ID, &d.TenantID, &status, &contentSnippet,
			&d.CreatedAt, &d.CreatedAt, &d.UpdatedAt,
			&d.Name, &d.FileType, &d.FileSize, &d.UploaderID); err != nil {
			return nil, 0, fmt.Errorf("scan pending: %w", err)
		}
		if contentSnippet.Valid {
			d.ContentSnippet = contentSnippet.String
		}
		if status.Valid {
			d.Status = model.ReviewStatus(status.String)
		}
		d.Status = model.ReviewPending
		docs = append(docs, d)
	}
	return docs, total, nil
}

func (s *PostgresStore) GetReviewByDocID(docID string) (*model.PendingDocument, error) {
	d := &model.PendingDocument{}
	var contentSnippet sql.NullString
	err := s.db.QueryRow(
		`SELECT r.id, r.doc_id, r.tenant_id, r.status, r.content_snippet, r.submitted_at, r.created_at, r.updated_at,
			COALESCE(d.name, ''), COALESCE(d.file_type, ''), COALESCE(d.file_size, 0), COALESCE(d.uploader_id, '')
		 FROM review_queue r
		 LEFT JOIN documents d ON d.id = r.doc_id
		 WHERE r.doc_id = $1`, docID,
	).Scan(&d.ID, &d.ID, &d.TenantID, &d.Status, &contentSnippet,
		&d.CreatedAt, &d.CreatedAt, &d.UpdatedAt,
		&d.Name, &d.FileType, &d.FileSize, &d.UploaderID)
	if err != nil {
		return nil, fmt.Errorf("get review: %w", err)
	}
	if contentSnippet.Valid {
		d.ContentSnippet = contentSnippet.String
	}
	return d, nil
}

func (s *PostgresStore) ReviewDocument(docID, reviewerID, action, reason string) error {
	status := "approved"
	if action == "reject" {
		status = "rejected"
	}
	result, err := s.db.Exec(
		`UPDATE review_queue SET status = $2, reviewer_id = $3, review_reason = $4, reviewed_at = NOW(), updated_at = NOW()
		 WHERE doc_id = $1`, docID, status, reviewerID, reason)
	if err != nil {
		return fmt.Errorf("review doc: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("review record not found")
	}
	return nil
}

func (s *PostgresStore) SubmitForReview(docID, tenantID, contentSnippet string) error {
	_, err := s.db.Exec(
		`INSERT INTO review_queue (doc_id, tenant_id, content_snippet, status)
		 VALUES ($1, $2, $3, 'pending')
		 ON CONFLICT DO NOTHING`,
		docID, tenantID, contentSnippet)
	return err
}

func (s *PostgresStore) GetConfig(key string) (*model.SystemConfig, error) {
	c := &model.SystemConfig{}
	err := s.db.QueryRow(
		`SELECT id, key, value, COALESCE(description,''), COALESCE(updated_by,''), updated_at
		 FROM system_configs WHERE key = $1`, key,
	).Scan(&c.ID, &c.Key, &c.Value, &c.Description, &c.UpdatedBy, &c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get config: %w", err)
	}
	return c, nil
}

func (s *PostgresStore) ListConfigs() ([]*model.SystemConfig, error) {
	rows, err := s.db.Query(
		`SELECT id, key, value, COALESCE(description,''), COALESCE(updated_by,''), updated_at
		 FROM system_configs ORDER BY key`)
	if err != nil {
		return nil, fmt.Errorf("list configs: %w", err)
	}
	defer rows.Close()
	var configs []*model.SystemConfig
	for rows.Next() {
		c := &model.SystemConfig{}
		if err := rows.Scan(&c.ID, &c.Key, &c.Value, &c.Description, &c.UpdatedBy, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan config: %w", err)
		}
		configs = append(configs, c)
	}
	return configs, nil
}

func (s *PostgresStore) UpsertConfig(key, value, description, updatedBy string) (*model.SystemConfig, error) {
	c := &model.SystemConfig{}
	err := s.db.QueryRow(
		`INSERT INTO system_configs (key, value, description, updated_by)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (key) DO UPDATE SET value = $2, description = COALESCE($3, system_configs.description), updated_by = $4, updated_at = NOW()
		 RETURNING id, key, value, COALESCE(description,''), COALESCE(updated_by,''), updated_at`,
		key, value, description, updatedBy,
	).Scan(&c.ID, &c.Key, &c.Value, &c.Description, &c.UpdatedBy, &c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("upsert config: %w", err)
	}
	return c, nil
}

func (s *PostgresStore) CreateIndexJob(triggeredBy string) (string, error) {
	var id string
	err := s.db.QueryRow(
		`INSERT INTO index_jobs (triggered_by, status) VALUES ($1, 'pending') RETURNING id`,
		triggeredBy,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create index job: %w", err)
	}
	return id, nil
}

func (s *PostgresStore) GetStats() (*model.SystemStats, error) {
	stats := &model.SystemStats{
		Services: make(map[string]string),
	}

	s.db.QueryRow(`SELECT COUNT(*) FROM documents`).Scan(&stats.TotalDocuments)
	s.db.QueryRow(`SELECT COUNT(*) FROM review_queue WHERE status = 'pending'`).Scan(&stats.PendingReviews)

	var activeUsers int64
	s.db.QueryRow(`SELECT COUNT(*) FROM (SELECT uploader_id FROM documents GROUP BY uploader_id) u`).Scan(&activeUsers)
	stats.ActiveUsers = activeUsers

	return stats, nil
}

func (s *PostgresStore) AddSensitiveWord(word, createdBy string) error {
	_, err := s.db.Exec(
		`INSERT INTO sensitive_words (word, created_by) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		word, createdBy)
	return err
}

func (s *PostgresStore) ListSensitiveWords() ([]string, error) {
	rows, err := s.db.Query(`SELECT word FROM sensitive_words ORDER BY word`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var words []string
	for rows.Next() {
		var w string
		if err := rows.Scan(&w); err != nil {
			return nil, err
		}
		words = append(words, w)
	}
	return words, nil
}

func (s *PostgresStore) DeleteSensitiveWord(word string) error {
	_, err := s.db.Exec(`DELETE FROM sensitive_words WHERE word = $1`, word)
	return err
}
