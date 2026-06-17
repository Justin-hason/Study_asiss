package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"knowledge-service/middleware"
	"knowledge-service/model"
	"knowledge-service/store"
)

type Handler struct {
	pg    *store.PostgresStore
	redis *store.RedisStore
}

func NewHandler(pg *store.PostgresStore, redis *store.RedisStore) *Handler {
	return &Handler{pg: pg, redis: redis}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, model.ErrorResp{Error: model.ErrorDetail{Code: code, Message: msg}})
}

func (h *Handler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	var req model.CreateFolderReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "name is required")
		return
	}
	if req.ParentID != nil {
		exists, err := h.pg.FolderBelongsToTenant(*req.ParentID, tenantID)
		if err != nil || !exists {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", "parent folder not found")
			return
		}
	}
	f, err := h.pg.CreateFolder(tenantID, req)
	if err != nil {
		log.Printf("CreateFolder error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to create folder")
		return
	}
	writeJSON(w, http.StatusCreated, f)
}

func (h *Handler) GetFolderTree(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	tree, err := h.pg.GetFolderTree(tenantID)
	if err != nil {
		log.Printf("GetFolderTree error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to get folder tree")
		return
	}
	if tree == nil {
		tree = []*model.Folder{}
	}
	writeJSON(w, http.StatusOK, tree)
}

func (h *Handler) MoveFolder(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	id := chi.URLParam(r, "id")
	ok, _ := h.pg.FolderBelongsToTenant(id, tenantID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "folder not found")
		return
	}
	var req model.MoveFolderReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.ParentID != nil {
		exists, err := h.pg.FolderBelongsToTenant(*req.ParentID, tenantID)
		if err != nil || !exists {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", "target parent folder not found")
			return
		}
	}
	if err := h.pg.MoveFolder(id, req); err != nil {
		log.Printf("MoveFolder error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to move folder")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) DeleteFolder(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	id := chi.URLParam(r, "id")
	ok, _ := h.pg.FolderBelongsToTenant(id, tenantID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "folder not found")
		return
	}
	if err := h.pg.DeleteFolder(id); err != nil {
		if errors.Is(err, errors.New("")) {
		}
		msg := err.Error()
		if containsAny(msg, "not empty") {
			writeError(w, http.StatusConflict, "NOT_EMPTY", msg)
			return
		}
		if containsAny(msg, "not found") {
			writeError(w, http.StatusNotFound, "NOT_FOUND", msg)
			return
		}
		log.Printf("DeleteFolder error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to delete folder")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) CreateTag(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	var req model.CreateTagReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "name is required")
		return
	}
	t, err := h.pg.CreateTag(tenantID, req)
	if err != nil {
		if containsAny(err.Error(), "unique", "duplicate") {
			writeError(w, http.StatusConflict, "CONFLICT", "tag already exists")
			return
		}
		log.Printf("CreateTag error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to create tag")
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

func (h *Handler) ListTags(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	tags, err := h.pg.ListTags(tenantID)
	if err != nil {
		log.Printf("ListTags error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to list tags")
		return
	}
	if tags == nil {
		tags = []*model.Tag{}
	}
	writeJSON(w, http.StatusOK, tags)
}

func (h *Handler) ListDocuments(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	q := r.URL.Query()

	page := 1
	if v, err := strconv.Atoi(q.Get("page")); err == nil && v > 0 {
		page = v
	}
	pageSize := 20
	if v, err := strconv.Atoi(q.Get("page_size")); err == nil && v > 0 {
		pageSize = v
	}
	if pageSize > 100 {
		pageSize = 100
	}

	keyword := q.Get("keyword")
	folderID := q.Get("folder_id")

	docs, total, err := h.pg.ListDocuments(tenantID, folderID, keyword, page, pageSize)
	if err != nil {
		log.Printf("ListDocuments error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to list documents")
		return
	}
	if docs == nil {
		docs = []*model.Document{}
	}
	writeJSON(w, http.StatusOK, model.ListDocumentsResp{
		Items:    docs,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

func (h *Handler) AddDocumentTag(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	docID := chi.URLParam(r, "id")
	tagID := chi.URLParam(r, "tagId")
	if docID == "" || tagID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "missing doc_id or tag_id")
		return
	}
	ok, _ := h.pg.DocumentBelongsToTenant(docID, tenantID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "document not found")
		return
	}
	ok, _ = h.pg.TagBelongsToTenant(tagID, tenantID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "tag not found")
		return
	}
	if err := h.pg.AddDocumentTag(docID, tagID); err != nil {
		log.Printf("AddDocumentTag error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to add tag")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) RemoveDocumentTag(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	docID := chi.URLParam(r, "id")
	tagID := chi.URLParam(r, "tagId")
	if docID == "" || tagID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "missing doc_id or tag_id")
		return
	}
	ok, _ := h.pg.DocumentBelongsToTenant(docID, tenantID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "document not found")
		return
	}
	if err := h.pg.RemoveDocumentTag(docID, tagID); err != nil {
		if containsAny(err.Error(), "not found") {
			writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		log.Printf("RemoveDocumentTag error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to remove tag")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) SetPermissions(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	docID := chi.URLParam(r, "id")
	ok, _ := h.pg.DocumentBelongsToTenant(docID, tenantID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "document not found")
		return
	}
	var req model.SetPermissionsReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.Level == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "level is required")
		return
	}
	validLevels := map[model.PermissionLevel]bool{
		model.PermPrivate: true, model.PermShared: true,
		model.PermOrganization: true, model.PermLink: true,
	}
	if !validLevels[req.Level] {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid permission level")
		return
	}
	if err := h.pg.SetPermissions(docID, req.Level, req.UserIDs); err != nil {
		log.Printf("SetPermissions error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to set permissions")
		return
	}
	if h.redis != nil {
		go func() {
			if err := h.redis.InvalidatePermissionCache(docID); err != nil {
				log.Printf("InvalidatePermissionCache error: %v", err)
			}
		}()
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) CreateShareLink(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	docID := chi.URLParam(r, "id")
	if docID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "missing doc_id")
		return
	}
	var req model.CreateShareLinkReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.ExpiresInHours <= 0 {
		req.ExpiresInHours = 24
	}
	if req.Password == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "password is required")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("bcrypt error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to hash password")
		return
	}
	link, err := h.pg.CreateShareLink(req, docID, string(hash), userID)
	if err != nil {
		log.Printf("CreateShareLink error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to create share link")
		return
	}
	resp := model.CreateShareLinkResp{
		Token:     link.Token,
		ExpiresAt: link.ExpiresAt,
		URL:       "/api/v1/knowledge/share/" + link.Token,
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) ListVersions(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	docID := chi.URLParam(r, "id")
	ok, _ := h.pg.DocumentBelongsToTenant(docID, tenantID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "document not found")
		return
	}
	versions, err := h.pg.ListVersions(docID)
	if err != nil {
		log.Printf("ListVersions error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to list versions")
		return
	}
	if versions == nil {
		versions = []*model.DocumentVersion{}
	}
	writeJSON(w, http.StatusOK, versions)
}

func (h *Handler) RestoreVersion(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	docID := chi.URLParam(r, "id")
	versionID := chi.URLParam(r, "versionId")
	ok, _ := h.pg.DocumentBelongsToTenant(docID, tenantID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "document not found")
		return
	}
	if err := h.pg.RestoreVersion(docID, versionID); err != nil {
		if containsAny(err.Error(), "not found") {
			writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		log.Printf("RestoreVersion error: %v", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to restore version")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) VerifyShareLink(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "missing token")
		return
	}
	link, err := h.pg.GetShareLinkByToken(token)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "share link not found")
		return
	}
	if time.Now().After(link.ExpiresAt) {
		writeError(w, http.StatusGone, "EXPIRED", "share link has expired")
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err == nil && req.Password != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(link.PasswordHash), []byte(req.Password)); err != nil {
			writeError(w, http.StatusForbidden, "INVALID_PASSWORD", "incorrect password")
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"doc_id":     link.DocID,
		"permission": link.Permission,
		"expires_at": link.ExpiresAt,
	})
}

func (h *Handler) Healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
	errPG := h.pg.Ping()
	errRedis := errors.New("not configured")
	if h.redis != nil {
		errRedis = h.redis.Ping()
	}
	if errPG != nil {
		writeError(w, http.StatusServiceUnavailable, "PG_DOWN", "postgresql unreachable")
		return
	}
	if h.redis != nil && errRedis != nil {
		writeError(w, http.StatusServiceUnavailable, "REDIS_DOWN", "redis unreachable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func containsAny(s string, substrs ...string) bool {
	for _, sub := range substrs {
		if len(sub) > 0 && sub == s {
			return true
		}
		if len(sub) > 0 && len(s) >= len(sub) {
			for i := 0; i <= len(s)-len(sub); i++ {
				match := true
				for j := 0; j < len(sub); j++ {
					if s[i+j] != sub[j] {
						match = false
						break
					}
				}
				if match {
					return true
				}
			}
		}
	}
	return false
}
