package api

import (
	"encoding/json"
	"log"
	"net/http"

	"search-service/middleware"
	"search-service/model"
	"search-service/search"
)

type Handler struct {
	svc *search.Service
}

func NewHandler(svc *search.Service) *Handler {
	return &Handler{svc: svc}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, model.ErrorResp{Error: model.ErrorDetail{Code: code, Message: msg}})
}

func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())

	var req model.SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}

	if req.Query == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "query is required")
		return
	}

	if req.TenantID == "" {
		req.TenantID = tenantID
	}
	if req.TenantID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "tenant_id is required")
		return
	}

	resp, err := h.svc.Search(r.Context(), &req)
	if err != nil {
		log.Printf("[handler] search error: %v", err)
		writeError(w, http.StatusInternalServerError, "SEARCH_ERROR", "search failed")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) MilvusHealth(w http.ResponseWriter, r *http.Request) {
	resp, err := h.svc.MilvusHealth(r.Context())
	if err != nil {
		log.Printf("[handler] milvus health error: %v", err)
	}
	status := http.StatusOK
	if resp.Status != "ok" {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, resp)
}

func (h *Handler) ESHealth(w http.ResponseWriter, r *http.Request) {
	resp, err := h.svc.ESHealth(r.Context())
	if err != nil {
		log.Printf("[handler] es health error: %v", err)
	}
	status := http.StatusOK
	if resp.Status != "ok" {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, resp)
}

func (h *Handler) RerankerHealth(w http.ResponseWriter, r *http.Request) {
	resp, err := h.svc.RerankerHealth(r.Context())
	if err != nil {
		log.Printf("[handler] reranker health error: %v", err)
	}
	status := http.StatusOK
	if resp.Status != "ok" {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, resp)
}

func (h *Handler) Healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
