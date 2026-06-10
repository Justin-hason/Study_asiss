package model

import "time"

type PermissionLevel string

const (
	PermPrivate      PermissionLevel = "PRIVATE"
	PermShared       PermissionLevel = "SHARED"
	PermOrganization PermissionLevel = "ORGANIZATION"
	PermLink         PermissionLevel = "LINK"
)

type Folder struct {
	ID        string     `json:"id"`
	TenantID  string     `json:"tenant_id"`
	ParentID  *string    `json:"parent_id,omitempty"`
	Name      string     `json:"name"`
	SortOrder int        `json:"sort_order"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	Children  []*Folder  `json:"children,omitempty"`
}

type Document struct {
	ID               string    `json:"id"`
	TenantID         string    `json:"tenant_id"`
	FolderID         *string   `json:"folder_id,omitempty"`
	Name             string    `json:"name"`
	FilePath         string    `json:"file_path,omitempty"`
	FileSize         int64     `json:"file_size"`
	FileType         string    `json:"file_type,omitempty"`
	CurrentVersionID *string   `json:"current_version_id,omitempty"`
	UploaderID       string    `json:"uploader_id"`
	Status           string    `json:"status"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type Tag struct {
	ID        string    `json:"id"`
	TenantID  string    `json:"tenant_id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"created_at"`
}

type Permission struct {
	ID              string          `json:"id"`
	DocID           string          `json:"doc_id"`
	UserID          string          `json:"user_id"`
	PermissionLevel PermissionLevel `json:"permission_level"`
	CreatedAt       time.Time       `json:"created_at"`
}

type DocumentVersion struct {
	ID            string    `json:"id"`
	DocID         string    `json:"doc_id"`
	VersionNumber int       `json:"version_number"`
	FilePath      string    `json:"file_path"`
	FileSize      int64     `json:"file_size"`
	UploaderID    string    `json:"uploader_id"`
	ChangeNote    string    `json:"change_note"`
	CreatedAt     time.Time `json:"created_at"`
}

type ShareLink struct {
	ID           string    `json:"id"`
	DocID        string    `json:"doc_id"`
	Token        string    `json:"token"`
	PasswordHash string    `json:"-"`
	ExpiresAt    time.Time `json:"expires_at"`
	Permission   string    `json:"permission"`
	CreatedBy    string    `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
}

type CreateFolderReq struct {
	Name     string  `json:"name"`
	ParentID *string `json:"parent_id"`
}

type MoveFolderReq struct {
	ParentID  *string `json:"parent_id"`
	SortOrder *int    `json:"sort_order"`
}

type CreateTagReq struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type AddDocTagReq struct {
	TagID string `json:"tag_id"`
}

type SetPermissionsReq struct {
	Level   PermissionLevel `json:"level"`
	UserIDs []string        `json:"user_ids"`
}

type CreateShareLinkReq struct {
	ExpiresInHours int    `json:"expires_in_hours"`
	Password       string `json:"password"`
	Permission     string `json:"permission"`
}

type CreateShareLinkResp struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	URL       string    `json:"url"`
}

type ErrorResp struct {
	Error ErrorDetail `json:"error"`
}

type ErrorDetail struct {
	Code    string   `json:"code"`
	Message string   `json:"message"`
	Details []string `json:"details,omitempty"`
}
