package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"admin-service/middleware"
	"admin-service/model"
	"admin-service/sensitive"
	"admin-service/store"
)

type Handler struct {
	pg       *store.PostgresStore
	rd       *store.RedisStore
	filter   *sensitive.Filter
	startAt  time.Time

	mu              sync.RWMutex
	serviceURLs     map[string]string
	requestCount    int64
	errorCount      int64
}

func NewHandler(pg *store.PostgresStore, rd *store.RedisStore, cfgSensitiveWords []string, serviceURLs map[string]string) *Handler {
	return &Handler{
		pg:          pg,
		rd:          rd,
		filter:      sensitive.NewFilter(cfgSensitiveWords),
		startAt:     time.Now(),
		serviceURLs: serviceURLs,
	}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, model.ErrorResp{Error: model.ErrorDetail{Code: code, Message: msg}})
}

func (h *Handler) incRequest() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.requestCount++
}

func (h *Handler) incError() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.errorCount++
}

func (h *Handler) ListPending(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	tenantID := middleware.GetTenantID(r.Context())

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	docs, total, err := h.pg.GetPendingDocuments(tenantID, page, pageSize)
	if err != nil {
		log.Printf("ListPending error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to list pending documents")
		return
	}
	if docs == nil {
		docs = []*model.PendingDocument{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items": docs,
		"total": total,
		"page":  page,
		"page_size": pageSize,
	})
}

func (h *Handler) ReviewDocument(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	docID := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r.Context())

	var req model.ReviewActionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.Action != "approve" && req.Action != "reject" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "action must be 'approve' or 'reject'")
		return
	}

	if req.Action == "approve" {
		doc, err := h.pg.GetReviewByDocID(docID)
		if err != nil {
			log.Printf("ReviewDocument get doc error: %v", err)
		} else if doc != nil {
			check := h.filter.Check(doc.ContentSnippet)
			if check.Found {
				writeError(w, http.StatusBadRequest, "SENSITIVE_CONTENT",
					fmt.Sprintf("document contains sensitive words: %s", strings.Join(check.Words, ", ")))
				return
			}
		}
	}

	if err := h.pg.ReviewDocument(docID, userID, req.Action, req.Reason); err != nil {
		log.Printf("ReviewDocument error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to review document")
		return
	}

	status := "approved"
	if req.Action == "reject" {
		status = "rejected"
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": status})
}

func (h *Handler) CheckSensitive(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	docID := chi.URLParam(r, "id")

	doc, err := h.pg.GetReviewByDocID(docID)
	if err != nil {
		h.incError()
		writeError(w, http.StatusNotFound, "NOT_FOUND", "document not found")
		return
	}

	check := h.filter.Check(doc.ContentSnippet)
	writeJSON(w, http.StatusOK, check)
}

func (h *Handler) ListConfigs(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	configs, err := h.pg.ListConfigs()
	if err != nil {
		log.Printf("ListConfigs error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to list configs")
		return
	}
	if configs == nil {
		configs = []*model.SystemConfig{}
	}
	writeJSON(w, http.StatusOK, configs)
}

func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	key := chi.URLParam(r, "key")
	if key == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "key is required")
		return
	}

	config, err := h.pg.GetConfig(key)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "config not found")
			return
		}
		log.Printf("GetConfig error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to get config")
		return
	}
	writeJSON(w, http.StatusOK, config)
}

func (h *Handler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	userID := middleware.GetUserID(r.Context())

	var req model.UpdateConfigReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.Key == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "key is required")
		return
	}

	config, err := h.pg.UpsertConfig(req.Key, req.Value, req.Description, userID)
	if err != nil {
		log.Printf("UpdateConfig error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to update config")
		return
	}
	writeJSON(w, http.StatusOK, config)
}

func (h *Handler) RebuildIndex(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	userID := middleware.GetUserID(r.Context())

	jobID, err := h.pg.CreateIndexJob(userID)
	if err != nil {
		log.Printf("RebuildIndex error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to create index job")
		return
	}

	go func() {
		if err := h.triggerRebuild(); err != nil {
			log.Printf("index rebuild failed: %v", err)
		}
	}()

	writeJSON(w, http.StatusAccepted, model.IndexRebuildResp{
		Status:  "accepted",
		Message: fmt.Sprintf("index rebuild job %s created and triggered", jobID),
	})
}

func (h *Handler) triggerRebuild() error {
	searchURL := h.serviceURLs["search"]
	if searchURL == "" {
		return fmt.Errorf("search service URL not configured")
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(searchURL+"/api/v1/search/rebuild", "application/json", nil)
	if err != nil {
		return fmt.Errorf("trigger search rebuild: %w", err)
	}
	defer resp.Body.Close()
	return nil
}

func (h *Handler) SystemStats(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	stats, err := h.pg.GetStats()
	if err != nil {
		log.Printf("SystemStats error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to get stats")
		return
	}

	stats.UptimeSeconds = int64(time.Since(h.startAt).Seconds())

	services := []struct {
		name string
		url  string
	}{
		{"knowledge", h.serviceURLs["knowledge"]},
		{"generate", h.serviceURLs["generate"]},
		{"search", h.serviceURLs["search"]},
		{"pipeline", h.serviceURLs["pipeline"]},
		{"learn", h.serviceURLs["learn"]},
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	for _, svc := range services {
		if svc.url == "" {
			stats.Services[svc.name] = "unknown"
			continue
		}
		wg.Add(1)
		go func(name, url string) {
			defer wg.Done()
			status := h.checkServiceHealth(url)
			mu.Lock()
			stats.Services[name] = status
			mu.Unlock()
		}(svc.name, svc.url)
	}
	wg.Wait()

	writeJSON(w, http.StatusOK, stats)
}

func (h *Handler) checkServiceHealth(url string) string {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url + "/healthz")
	if err != nil {
		return "unreachable"
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return "ok"
	}
	return "degraded"
}

func (h *Handler) ListSensitiveWords(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	words, err := h.pg.ListSensitiveWords()
	if err != nil {
		log.Printf("ListSensitiveWords error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to list sensitive words")
		return
	}
	if words == nil {
		words = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"words": words,
	})
}

func (h *Handler) AddSensitiveWord(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	userID := middleware.GetUserID(r.Context())

	var req struct {
		Word string `json:"word"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.Word == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "word is required")
		return
	}

	if err := h.pg.AddSensitiveWord(req.Word, userID); err != nil {
		log.Printf("AddSensitiveWord error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to add sensitive word")
		return
	}
	h.filter.AddWord(req.Word)

	writeJSON(w, http.StatusCreated, map[string]string{"status": "ok"})
}

func (h *Handler) DeleteSensitiveWord(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	word := chi.URLParam(r, "word")
	if word == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "word is required")
		return
	}

	if err := h.pg.DeleteSensitiveWord(word); err != nil {
		log.Printf("DeleteSensitiveWord error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to delete sensitive word")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) ListIndexJobs(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) Healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
	errPG := h.pg.Ping()
	errRedis := error(nil)
	if h.rd != nil {
		errRedis = h.rd.Ping()
	}
	if errPG != nil {
		writeError(w, http.StatusServiceUnavailable, "PG_DOWN", "postgresql unreachable")
		return
	}
	if h.rd != nil && errRedis != nil {
		writeError(w, http.StatusServiceUnavailable, "REDIS_DOWN", "redis unreachable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	services := []struct {
		name string
		url  string
	}{
		{"knowledge", h.serviceURLs["knowledge"]},
		{"generate", h.serviceURLs["generate"]},
		{"search", h.serviceURLs["search"]},
		{"pipeline", h.serviceURLs["pipeline"]},
		{"learn", h.serviceURLs["learn"]},
	}

	resp := model.HealthResponse{
		Status:   "ok",
		Services: make(map[string]string),
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	hasDegraded := false

	for _, svc := range services {
		if svc.url == "" {
			resp.Services[svc.name] = "unknown"
			continue
		}
		wg.Add(1)
		go func(name, url string) {
			defer wg.Done()
			status := "unreachable"
			client := &http.Client{Timeout: 2 * time.Second}
			if resp, err := client.Get(url + "/healthz"); err == nil {
				resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					status = "ok"
				} else {
					status = "degraded"
				}
			}
			mu.Lock()
			resp.Services[name] = status
			if status != "ok" {
				hasDegraded = true
			}
			mu.Unlock()
		}(svc.name, svc.url)
	}
	wg.Wait()

	if hasDegraded {
		resp.Status = "degraded"
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) Metrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	h.mu.RLock()
	rc := h.requestCount
	ec := h.errorCount
	h.mu.RUnlock()

	fmt.Fprintf(w, "# HELP admin_requests_total Total admin API requests\n")
	fmt.Fprintf(w, "# TYPE admin_requests_total counter\n")
	fmt.Fprintf(w, "admin_requests_total %d\n", rc)
	fmt.Fprintf(w, "# HELP admin_errors_total Total admin API errors\n")
	fmt.Fprintf(w, "# TYPE admin_errors_total counter\n")
	fmt.Fprintf(w, "admin_errors_total %d\n", ec)
	fmt.Fprintf(w, "# HELP admin_uptime_seconds Admin service uptime\n")
	fmt.Fprintf(w, "# TYPE admin_uptime_seconds gauge\n")
	fmt.Fprintf(w, "admin_uptime_seconds %d\n", int64(time.Since(h.startAt).Seconds()))
	fmt.Fprintf(w, "# HELP admin_pending_reviews Pending document reviews count\n")
	fmt.Fprintf(w, "# TYPE admin_pending_reviews gauge\n")
	stats, err := h.pg.GetStats()
	if err == nil {
		fmt.Fprintf(w, "admin_pending_reviews %d\n", stats.PendingReviews)
	}
}
