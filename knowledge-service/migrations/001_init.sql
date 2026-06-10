CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE RESTRICT,
    name VARCHAR(256) NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_folders_tenant ON folders(tenant_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);

CREATE TABLE documents (
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
);

CREATE INDEX idx_documents_tenant ON documents(tenant_id);
CREATE INDEX idx_documents_folder ON documents(folder_id);
CREATE INDEX idx_documents_uploader ON documents(uploader_id);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL,
    permission_level VARCHAR(32) NOT NULL CHECK (permission_level IN ('PRIVATE','SHARED','ORGANIZATION','LINK')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(doc_id, user_id)
);

CREATE INDEX idx_permissions_doc ON permissions(doc_id);
CREATE INDEX idx_permissions_user ON permissions(user_id);

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    color VARCHAR(7) DEFAULT '#1890ff',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_tags_tenant ON tags(tenant_id);

CREATE TABLE document_tags (
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (doc_id, tag_id)
);

CREATE INDEX idx_document_tags_tag ON document_tags(tag_id);

CREATE TABLE document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    file_path VARCHAR(1024) NOT NULL,
    file_size BIGINT DEFAULT 0,
    uploader_id VARCHAR(64) NOT NULL,
    change_note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(doc_id, version_number)
);

CREATE INDEX idx_doc_versions_doc ON document_versions(doc_id);

CREATE TABLE share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(256) DEFAULT '',
    expires_at TIMESTAMPTZ NOT NULL,
    permission VARCHAR(32) DEFAULT 'READ',
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_share_links_token ON share_links(token);
CREATE INDEX idx_share_links_doc ON share_links(doc_id);
