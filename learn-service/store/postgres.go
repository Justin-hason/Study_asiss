package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/lib/pq"

	"learn-service/model"
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
		`CREATE TABLE IF NOT EXISTS knowledge_points (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id VARCHAR(64) NOT NULL,
			name VARCHAR(512) NOT NULL,
			parent_id UUID REFERENCES knowledge_points(id),
			source_doc_ids TEXT[] DEFAULT '{}',
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_kp_tenant ON knowledge_points(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_kp_parent ON knowledge_points(parent_id)`,

		`CREATE TABLE IF NOT EXISTS user_mastery (
			user_id VARCHAR(64) NOT NULL,
			kp_id UUID NOT NULL REFERENCES knowledge_points(id),
			score DOUBLE PRECISION NOT NULL DEFAULT 0,
			s_mark DOUBLE PRECISION NOT NULL DEFAULT 0,
			s_quiz DOUBLE PRECISION NOT NULL DEFAULT 0,
			s_freq DOUBLE PRECISION NOT NULL DEFAULT 0,
			s_retention DOUBLE PRECISION NOT NULL DEFAULT 0,
			s_depth DOUBLE PRECISION NOT NULL DEFAULT 0,
			last_marked_level VARCHAR(32) DEFAULT '',
			last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW(),
			PRIMARY KEY (user_id, kp_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_um_user ON user_mastery(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_um_score ON user_mastery(score)`,

		`CREATE TABLE IF NOT EXISTS push_tasks (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id VARCHAR(64) NOT NULL,
			kp_ids UUID[] NOT NULL DEFAULT '{}',
			content TEXT DEFAULT '',
			status VARCHAR(32) NOT NULL DEFAULT 'pending',
			push_date DATE NOT NULL DEFAULT CURRENT_DATE,
			completed_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_pt_user ON push_tasks(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_pt_status ON push_tasks(status)`,
		`CREATE INDEX IF NOT EXISTS idx_pt_push_date ON push_tasks(push_date)`,
	}
	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return fmt.Errorf("migration: %w", err)
		}
	}
	return nil
}

func (s *PostgresStore) GetKnowledgePoints(tenantID string) ([]model.KnowledgePoint, error) {
	rows, err := s.db.Query(
		`SELECT id, tenant_id, name, parent_id, COALESCE(source_doc_ids, '{}') FROM knowledge_points WHERE tenant_id = $1 ORDER BY name`,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("query knowledge points: %w", err)
	}
	defer rows.Close()

	var points []model.KnowledgePoint
	for rows.Next() {
		var kp model.KnowledgePoint
		var parentID sql.NullString
		var docIDsStr string
		if err := rows.Scan(&kp.ID, &kp.TenantID, &kp.Name, &parentID, &docIDsStr); err != nil {
			return nil, fmt.Errorf("scan kp: %w", err)
		}
		if parentID.Valid {
			kp.ParentID = &parentID.String
		}
		if err := json.Unmarshal([]byte(docIDsStr), &kp.SourceDocIDs); err != nil {
			kp.SourceDocIDs = nil
		}
		points = append(points, kp)
	}
	return points, nil
}

func (s *PostgresStore) GetUserMastery(userID string) ([]model.UserMastery, error) {
	rows, err := s.db.Query(
		`SELECT user_id, kp_id, score, s_mark, s_quiz, s_freq, s_retention, s_depth, last_calculated_at
		 FROM user_mastery WHERE user_id = $1 ORDER BY score DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("query user mastery: %w", err)
	}
	defer rows.Close()

	var items []model.UserMastery
	for rows.Next() {
		var m model.UserMastery
		if err := rows.Scan(&m.UserID, &m.KpID, &m.Score, &m.SMark, &m.SQuiz, &m.SFreq, &m.SRetention, &m.SDepth, &m.LastCalculatedAt); err != nil {
			return nil, fmt.Errorf("scan mastery: %w", err)
		}
		items = append(items, m)
	}
	return items, nil
}

func (s *PostgresStore) GetUserMasteryByKp(userID, kpID string) (*model.UserMastery, error) {
	m := &model.UserMastery{}
	err := s.db.QueryRow(
		`SELECT user_id, kp_id, score, s_mark, s_quiz, s_freq, s_retention, s_depth, last_calculated_at
		 FROM user_mastery WHERE user_id = $1 AND kp_id = $2`,
		userID, kpID,
	).Scan(&m.UserID, &m.KpID, &m.Score, &m.SMark, &m.SQuiz, &m.SFreq, &m.SRetention, &m.SDepth, &m.LastCalculatedAt)
	if err != nil {
		return nil, fmt.Errorf("get mastery by kp: %w", err)
	}
	return m, nil
}

func (s *PostgresStore) UpsertMastery(m *model.UserMastery) error {
	_, err := s.db.Exec(
		`INSERT INTO user_mastery (user_id, kp_id, score, s_mark, s_quiz, s_freq, s_retention, s_depth, last_calculated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 ON CONFLICT (user_id, kp_id) DO UPDATE SET
		 score = $3, s_mark = $4, s_quiz = $5, s_freq = $6, s_retention = $7, s_depth = $8,
		 last_calculated_at = $9, updated_at = NOW()`,
		m.UserID, m.KpID, m.Score, m.SMark, m.SQuiz, m.SFreq, m.SRetention, m.SDepth, m.LastCalculatedAt,
	)
	return err
}

func (s *PostgresStore) UpdateMarkMastery(userID, kpID string, level string) error {
	var sMark float64
	switch level {
	case "mastered":
		sMark = 100
	case "familiar":
		sMark = 40
	default:
		sMark = 0
	}

	_, err := s.db.Exec(
		`INSERT INTO user_mastery (user_id, kp_id, s_mark, score, last_marked_level, last_calculated_at)
		 VALUES ($1, $2, $3, $3, $4, NOW())
		 ON CONFLICT (user_id, kp_id) DO UPDATE SET
		 s_mark = $3, last_marked_level = $4, updated_at = NOW()`,
		userID, kpID, sMark, level,
	)
	return err
}

func (s *PostgresStore) GetPushTasks(userID string, date string) ([]model.PushTask, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, kp_ids, content, status, created_at
		 FROM push_tasks WHERE user_id = $1 AND push_date = $2::DATE ORDER BY created_at DESC`,
		userID, date,
	)
	if err != nil {
		return nil, fmt.Errorf("query push tasks: %w", err)
	}
	defer rows.Close()

	var tasks []model.PushTask
	for rows.Next() {
		var t model.PushTask
		var kpIDsStr string
		if err := rows.Scan(&t.ID, &t.UserID, &kpIDsStr, &t.Content, &t.Status, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan push task: %w", err)
		}
		if err := json.Unmarshal([]byte(kpIDsStr), &t.KpIDs); err != nil {
			t.KpIDs = nil
		}
		tasks = append(tasks, t)
	}
	return tasks, nil
}

func (s *PostgresStore) CreatePushTasks(tasks []model.PushTask) error {
	for _, t := range tasks {
		kpIDsJSON, err := json.Marshal(t.KpIDs)
		if err != nil {
			return fmt.Errorf("marshal kp_ids: %w", err)
		}
		_, err = s.db.Exec(
			`INSERT INTO push_tasks (user_id, kp_ids, content, status, push_date)
			 VALUES ($1, $2::uuid[], $3, $4, CURRENT_DATE)`,
			t.UserID, string(kpIDsJSON), t.Content, t.Status,
		)
		if err != nil {
			return fmt.Errorf("create push task: %w", err)
		}
	}
	return nil
}

func (s *PostgresStore) GetUsersForPush() ([]string, error) {
	rows, err := s.db.Query(
		`SELECT DISTINCT user_id FROM user_mastery ORDER BY user_id`,
	)
	if err != nil {
		return nil, fmt.Errorf("query users: %w", err)
	}
	defer rows.Close()

	var users []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, nil
}

func (s *PostgresStore) GetUserMasteryBelowThreshold(userID string, scoreThreshold float64, retentionThreshold float64) ([]model.UserMastery, error) {
	rows, err := s.db.Query(
		`SELECT um.user_id, um.kp_id, um.score, um.s_mark, um.s_quiz, um.s_freq, um.s_retention, um.s_depth, um.last_calculated_at
		 FROM user_mastery um
		 WHERE um.user_id = $1 AND (um.score < $2 OR um.s_retention < $3)
		 ORDER BY um.score ASC, um.s_retention ASC`,
		userID, scoreThreshold, retentionThreshold,
	)
	if err != nil {
		return nil, fmt.Errorf("query mastery below threshold: %w", err)
	}
	defer rows.Close()

	var items []model.UserMastery
	for rows.Next() {
		var m model.UserMastery
		if err := rows.Scan(&m.UserID, &m.KpID, &m.Score, &m.SMark, &m.SQuiz, &m.SFreq, &m.SRetention, &m.SDepth, &m.LastCalculatedAt); err != nil {
			return nil, fmt.Errorf("scan mastery: %w", err)
		}
		items = append(items, m)
	}
	return items, nil
}

func (s *PostgresStore) GetRecentPushCount(userID string, since time.Time) (int, error) {
	var count int
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM push_tasks WHERE user_id = $1 AND created_at >= $2 AND status = 'pending'`,
		userID, since,
	).Scan(&count)
	return count, err
}
