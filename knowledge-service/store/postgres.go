package store

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"

	"knowledge-service/model"
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
		`CREATE TABLE IF NOT EXISTS folders (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id VARCHAR(64) NOT NULL,
			parent_id UUID REFERENCES folders(id) ON DELETE RESTRICT,
			name VARCHAR(256) NOT NULL,
			sort_order INT DEFAULT 0,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS documents (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id VARCHAR(64) NOT NULL,
			folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
			name VARCHAR(512) NOT NULL,
			file_path VARCHAR(1024),
			file_size BIGINT DEFAULT 0,
			file_type VARCHAR(32),
			current_version_id UUID,
			uploader_id VARCHAR(64) NOT NULL,
			status VARCHAR(32) DEFAULT 'active',
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS permissions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
			user_id VARCHAR(64) NOT NULL,
			permission_level VARCHAR(32) NOT NULL CHECK (permission_level IN ('PRIVATE','SHARED','ORGANIZATION','LINK')),
			created_at TIMESTAMPTZ DEFAULT NOW(),
			UNIQUE(doc_id, user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS tags (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id VARCHAR(64) NOT NULL,
			name VARCHAR(128) NOT NULL,
			color VARCHAR(7) DEFAULT '#1890ff',
			created_at TIMESTAMPTZ DEFAULT NOW(),
			UNIQUE(tenant_id, name)
		)`,
		`CREATE TABLE IF NOT EXISTS document_tags (
			doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
			tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			PRIMARY KEY (doc_id, tag_id)
		)`,
		`CREATE TABLE IF NOT EXISTS document_versions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
			version_number INT NOT NULL,
			file_path VARCHAR(1024) NOT NULL,
			file_size BIGINT DEFAULT 0,
			uploader_id VARCHAR(64) NOT NULL,
			change_note TEXT DEFAULT '',
			created_at TIMESTAMPTZ DEFAULT NOW(),
			UNIQUE(doc_id, version_number)
		)`,
		`CREATE TABLE IF NOT EXISTS share_links (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
			token VARCHAR(64) NOT NULL UNIQUE,
			password_hash VARCHAR(256) DEFAULT '',
			expires_at TIMESTAMPTZ NOT NULL,
			permission VARCHAR(32) DEFAULT 'READ',
			created_by VARCHAR(64) NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_folders_tenant ON folders(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)`,
		`CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id)`,
		`CREATE INDEX IF NOT EXISTS idx_documents_uploader ON documents(uploader_id)`,
		`CREATE INDEX IF NOT EXISTS idx_permissions_doc ON permissions(doc_id)`,
		`CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_tags_tenant ON tags(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags(tag_id)`,
		`CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON document_versions(doc_id)`,
		`CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token)`,
		`CREATE INDEX IF NOT EXISTS idx_share_links_doc ON share_links(doc_id)`,
	}
	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return fmt.Errorf("migration: %w", err)
		}
	}
	return nil
}

func (s *PostgresStore) CreateFolder(tenantID string, req model.CreateFolderReq) (*model.Folder, error) {
	f := &model.Folder{}
	err := s.db.QueryRow(
		`INSERT INTO folders (tenant_id, parent_id, name) VALUES ($1, $2, $3)
		 RETURNING id, tenant_id, parent_id, name, sort_order, created_at, updated_at`,
		tenantID, req.ParentID, req.Name,
	).Scan(&f.ID, &f.TenantID, &f.ParentID, &f.Name, &f.SortOrder, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create folder: %w", err)
	}
	return f, nil
}

func (s *PostgresStore) GetFolderTree(tenantID string) ([]*model.Folder, error) {
	rows, err := s.db.Query(
		`SELECT id, tenant_id, parent_id, name, sort_order, created_at, updated_at
		 FROM folders WHERE tenant_id = $1 ORDER BY sort_order, name`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query folders: %w", err)
	}
	defer rows.Close()

	var all []*model.Folder
	byID := make(map[string]*model.Folder)
	for rows.Next() {
		f := &model.Folder{}
		if err := rows.Scan(&f.ID, &f.TenantID, &f.ParentID, &f.Name, &f.SortOrder, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan folder: %w", err)
		}
		all = append(all, f)
		byID[f.ID] = f
	}
	var roots []*model.Folder
	for _, f := range all {
		if f.ParentID == nil {
			roots = append(roots, f)
		} else {
			parent := byID[*f.ParentID]
			if parent != nil {
				parent.Children = append(parent.Children, f)
			}
		}
	}
	return roots, nil
}

func (s *PostgresStore) MoveFolder(id string, req model.MoveFolderReq) error {
	var parentID interface{}
	if req.ParentID != nil {
		parentID = *req.ParentID
	}
	result, err := s.db.Exec(
		`UPDATE folders SET parent_id = $2, sort_order = COALESCE($3, sort_order), updated_at = NOW() WHERE id = $1`,
		id, parentID, req.SortOrder)
	if err != nil {
		return fmt.Errorf("move folder: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("folder not found")
	}
	return nil
}

func (s *PostgresStore) DeleteFolder(id string) error {
	var childCount int
	s.db.QueryRow(`SELECT COUNT(*) FROM folders WHERE parent_id = $1`, id).Scan(&childCount)
	if childCount > 0 {
		return fmt.Errorf("folder not empty: has %d sub-folders", childCount)
	}
	var docCount int
	s.db.QueryRow(`SELECT COUNT(*) FROM documents WHERE folder_id = $1`, id).Scan(&docCount)
	if docCount > 0 {
		return fmt.Errorf("folder not empty: has %d documents", docCount)
	}
	result, err := s.db.Exec(`DELETE FROM folders WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete folder: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("folder not found")
	}
	return nil
}

func (s *PostgresStore) CreateTag(tenantID string, req model.CreateTagReq) (*model.Tag, error) {
	t := &model.Tag{}
	color := req.Color
	if color == "" {
		color = "#1890ff"
	}
	err := s.db.QueryRow(
		`INSERT INTO tags (tenant_id, name, color) VALUES ($1, $2, $3)
		 RETURNING id, tenant_id, name, color, created_at`,
		tenantID, req.Name, color,
	).Scan(&t.ID, &t.TenantID, &t.Name, &t.Color, &t.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create tag: %w", err)
	}
	return t, nil
}

func (s *PostgresStore) ListTags(tenantID string) ([]*model.Tag, error) {
	rows, err := s.db.Query(
		`SELECT id, tenant_id, name, color, created_at FROM tags WHERE tenant_id = $1 ORDER BY name`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}
	defer rows.Close()
	var tags []*model.Tag
	for rows.Next() {
		t := &model.Tag{}
		if err := rows.Scan(&t.ID, &t.TenantID, &t.Name, &t.Color, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan tag: %w", err)
		}
		tags = append(tags, t)
	}
	return tags, nil
}

func (s *PostgresStore) AddDocumentTag(docID, tagID string) error {
	_, err := s.db.Exec(`INSERT INTO document_tags (doc_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, docID, tagID)
	if err != nil {
		return fmt.Errorf("add tag: %w", err)
	}
	return nil
}

func (s *PostgresStore) RemoveDocumentTag(docID, tagID string) error {
	result, err := s.db.Exec(`DELETE FROM document_tags WHERE doc_id = $1 AND tag_id = $2`, docID, tagID)
	if err != nil {
		return fmt.Errorf("remove tag: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("tag association not found")
	}
	return nil
}

func (s *PostgresStore) SetPermissions(docID string, level model.PermissionLevel, userIDs []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.Exec(`DELETE FROM permissions WHERE doc_id = $1`, docID)
	if err != nil {
		return fmt.Errorf("clear permissions: %w", err)
	}

	for _, uid := range userIDs {
		_, err = tx.Exec(
			`INSERT INTO permissions (doc_id, user_id, permission_level) VALUES ($1, $2, $3)`,
			docID, uid, string(level))
		if err != nil {
			return fmt.Errorf("insert permission: %w", err)
		}
	}

	return tx.Commit()
}

func (s *PostgresStore) GetPermissionLevel(docID, userID string) (model.PermissionLevel, error) {
	var level string
	err := s.db.QueryRow(
		`SELECT permission_level FROM permissions WHERE doc_id = $1 AND user_id = $2`, docID, userID,
	).Scan(&level)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return model.PermissionLevel(level), nil
}

func (s *PostgresStore) GetDocumentUploader(docID string) (string, error) {
	var uploaderID string
	err := s.db.QueryRow(`SELECT uploader_id FROM documents WHERE id = $1`, docID).Scan(&uploaderID)
	if err != nil {
		return "", err
	}
	return uploaderID, nil
}

func (s *PostgresStore) GetDocumentTenant(docID string) (string, error) {
	var tenantID string
	err := s.db.QueryRow(`SELECT tenant_id FROM documents WHERE id = $1`, docID).Scan(&tenantID)
	if err != nil {
		return "", err
	}
	return tenantID, nil
}

func (s *PostgresStore) CreateShareLink(req model.CreateShareLinkReq, docID, passwordHash, createdBy string) (*model.ShareLink, error) {
	expiresAt := time.Now().Add(time.Duration(req.ExpiresInHours) * time.Hour)
	perm := req.Permission
	if perm == "" {
		perm = "READ"
	}
	link := &model.ShareLink{}
	err := s.db.QueryRow(
		`INSERT INTO share_links (doc_id, token, password_hash, expires_at, permission, created_by)
		 VALUES ($1, encode(gen_random_bytes(32), 'hex'), $2, $3, $4, $5)
		 RETURNING id, doc_id, token, password_hash, expires_at, permission, created_by, created_at`,
		docID, passwordHash, expiresAt, perm, createdBy,
	).Scan(&link.ID, &link.DocID, &link.Token, &link.PasswordHash, &link.ExpiresAt, &link.Permission, &link.CreatedBy, &link.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create share link: %w", err)
	}
	return link, nil
}

func (s *PostgresStore) GetShareLinkByToken(token string) (*model.ShareLink, error) {
	link := &model.ShareLink{}
	err := s.db.QueryRow(
		`SELECT id, doc_id, token, password_hash, expires_at, permission, created_by, created_at
		 FROM share_links WHERE token = $1`, token,
	).Scan(&link.ID, &link.DocID, &link.Token, &link.PasswordHash, &link.ExpiresAt, &link.Permission, &link.CreatedBy, &link.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get share link: %w", err)
	}
	return link, nil
}

func (s *PostgresStore) ListVersions(docID string) ([]*model.DocumentVersion, error) {
	rows, err := s.db.Query(
		`SELECT id, doc_id, version_number, file_path, file_size, uploader_id, change_note, created_at
		 FROM document_versions WHERE doc_id = $1 ORDER BY version_number DESC`, docID)
	if err != nil {
		return nil, fmt.Errorf("list versions: %w", err)
	}
	defer rows.Close()
	var versions []*model.DocumentVersion
	for rows.Next() {
		v := &model.DocumentVersion{}
		if err := rows.Scan(&v.ID, &v.DocID, &v.VersionNumber, &v.FilePath, &v.FileSize, &v.UploaderID, &v.ChangeNote, &v.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan version: %w", err)
		}
		versions = append(versions, v)
	}
	return versions, nil
}

func (s *PostgresStore) RestoreVersion(docID, versionID string) error {
	var filePath string
	var versionNumber int
	err := s.db.QueryRow(
		`SELECT file_path, version_number FROM document_versions WHERE id = $1 AND doc_id = $2`,
		versionID, docID).Scan(&filePath, &versionNumber)
	if err != nil {
		return fmt.Errorf("version not found: %w", err)
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	nextVersion := versionNumber + 1
	newVersionID := ""
	err = tx.QueryRow(
		`INSERT INTO document_versions (doc_id, version_number, file_path, file_size, uploader_id, change_note)
		 SELECT $2, $3, file_path, file_size, uploader_id, 'restored from version ' || $4::text
		 FROM document_versions WHERE id = $1 RETURNING id`,
		versionID, docID, nextVersion, versionNumber,
	).Scan(&newVersionID)
	if err != nil {
		return fmt.Errorf("create restored version: %w", err)
	}

	_, err = tx.Exec(`UPDATE documents SET current_version_id = $2, updated_at = NOW() WHERE id = $1`,
		docID, newVersionID)
	if err != nil {
		return fmt.Errorf("update document current version: %w", err)
	}

	return tx.Commit()
}

func (s *PostgresStore) GetAccessibleDocIDs(tenantID, userID string) ([]string, error) {
	rows, err := s.db.Query(`
		SELECT DISTINCT d.id FROM documents d
		LEFT JOIN permissions p ON p.doc_id = d.id
		WHERE d.tenant_id = $1
		AND (
			d.uploader_id = $2
			OR p.user_id = $2
			OR p.permission_level = 'ORGANIZATION'
		)
	`, tenantID, userID)
	if err != nil {
		return nil, fmt.Errorf("get accessible docs: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func (s *PostgresStore) FolderExists(id string) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM folders WHERE id = $1`, id).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *PostgresStore) DocumentExists(id string) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM documents WHERE id = $1`, id).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *PostgresStore) TagExists(id string) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM tags WHERE id = $1`, id).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *PostgresStore) FolderBelongsToTenant(id, tenantID string) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM folders WHERE id = $1 AND tenant_id = $2`, id, tenantID).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *PostgresStore) TagBelongsToTenant(id, tenantID string) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM tags WHERE id = $1 AND tenant_id = $2`, id, tenantID).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *PostgresStore) DocumentBelongsToTenant(id, tenantID string) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM documents WHERE id = $1 AND tenant_id = $2`, id, tenantID).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *PostgresStore) CreateDocument(doc *model.Document) error {
	return s.db.QueryRow(
		`INSERT INTO documents (tenant_id, folder_id, name, file_path, file_size, file_type, uploader_id, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		 RETURNING id, created_at, updated_at`,
		doc.TenantID, doc.FolderID, doc.Name, doc.FilePath, doc.FileSize, doc.FileType, doc.UploaderID, doc.Status,
	).Scan(&doc.ID, &doc.CreatedAt, &doc.UpdatedAt)
}

func (s *PostgresStore) ListDocuments(tenantID, folderID, keyword string, page, pageSize int) ([]*model.Document, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	offset := (page - 1) * pageSize
	rows, err := s.db.Query(
		`SELECT id, tenant_id, folder_id, name, file_path, file_size, file_type, current_version_id, uploader_id, status, created_at, updated_at,
		        COUNT(*) OVER() AS total
		 FROM documents WHERE tenant_id = $1
		 AND ($2 = '' OR folder_id = $2::uuid)
		 AND ($3 = '' OR name ILIKE '%' || $3 || '%')
		 ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
		tenantID, folderID, keyword, pageSize, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list documents: %w", err)
	}
	defer rows.Close()
	var docs []*model.Document
	var total int
	for rows.Next() {
		d := &model.Document{}
		var rowTotal int
		if err := rows.Scan(&d.ID, &d.TenantID, &d.FolderID, &d.Name, &d.FilePath, &d.FileSize, &d.FileType, &d.CurrentVersionID, &d.UploaderID, &d.Status, &d.CreatedAt, &d.UpdatedAt, &rowTotal); err != nil {
			return nil, 0, fmt.Errorf("scan document: %w", err)
		}
		if total == 0 {
			total = rowTotal
		}
		docs = append(docs, d)
	}
	return docs, total, nil
}
