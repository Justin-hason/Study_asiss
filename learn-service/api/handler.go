package api

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/segmentio/kafka-go"

	"learn-service/engine"
	"learn-service/middleware"
	"learn-service/model"
	"learn-service/store"
)

type Handler struct {
	pg    *store.PostgresStore
	rd    *store.RedisStore
	mongo *store.MongoStore
	kp    *store.KafkaProducer

	masteryCalcInterval time.Duration
	forgettingCurveS    float64
	pushTaskLimit       int
	startAt             time.Time

	mu           sync.RWMutex
	requestCount int64
	errorCount   int64
}

func NewHandler(pg *store.PostgresStore, rd *store.RedisStore, mongo *store.MongoStore, kp *store.KafkaProducer, calcInterval time.Duration, forgettingCurveS float64, pushTaskLimit int) *Handler {
	return &Handler{
		pg:                  pg,
		rd:                  rd,
		mongo:               mongo,
		kp:                  kp,
		masteryCalcInterval: calcInterval,
		forgettingCurveS:    forgettingCurveS,
		pushTaskLimit:       pushTaskLimit,
		startAt:             time.Now(),
	}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, model.ErrResp{Error: model.ErrDetail{Code: code, Message: msg}})
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

func (h *Handler) PostEvents(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	userID := middleware.GetUserID(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req model.EventReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if len(req.Events) == 0 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "events array is required")
		return
	}

	for _, ev := range req.Events {
		payloadBytes, err := json.Marshal(ev.Payload)
		if err != nil {
			log.Printf("marshal payload error: %v", err)
			continue
		}
		eventData := map[string]interface{}{
			"user_id":    userID,
			"tenant_id":  tenantID,
			"event_type": ev.EventType,
			"timestamp":  ev.Timestamp,
			"session_id": ev.SessionID,
			"payload":    payloadBytes,
		}
		value, err := json.Marshal(eventData)
		if err != nil {
			log.Printf("marshal event error: %v", err)
			continue
		}
		msg := kafka.Message{
			Key:   []byte(userID),
			Value: value,
		}
		if err := h.kp.WriteMessages(r.Context(), msg); err != nil {
			log.Printf("kafka write error: %v", err)
			h.incError()
		}
	}

	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

func (h *Handler) GetMastery(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	userID := middleware.GetUserID(r.Context())

	items, err := h.pg.GetUserMastery(userID)
	if err != nil {
		log.Printf("GetMastery error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to get mastery")
		return
	}
	if items == nil {
		items = []model.UserMastery{}
	}

	writeJSON(w, http.StatusOK, model.MasteryResponse{
		Items: items,
		Total: len(items),
	})
}

func (h *Handler) GetTodayPushTasks(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	userID := middleware.GetUserID(r.Context())

	tasks, err := h.rd.GetPushTasks(userID)
	if err == nil && tasks != nil {
		writeJSON(w, http.StatusOK, model.PushTasksResponse{
			Items: tasks,
			Date:  time.Now().Format("2006-01-02"),
		})
		return
	}

	date := time.Now().Format("2006-01-02")
	tasks, err = h.pg.GetPushTasks(userID, date)
	if err != nil {
		log.Printf("GetPushTasks error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to get push tasks")
		return
	}
	if tasks == nil {
		tasks = []model.PushTask{}
	}

	if len(tasks) > 0 {
		ttl := time.Until(time.Now().Truncate(24*time.Hour).Add(48 * time.Hour))
		if err := h.rd.SetPushTasks(userID, tasks, ttl); err != nil {
			log.Printf("redis cache push tasks error: %v", err)
		}
	}

	writeJSON(w, http.StatusOK, model.PushTasksResponse{
		Items: tasks,
		Date:  date,
	})
}

func (h *Handler) MarkMastery(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	userID := middleware.GetUserID(r.Context())
	kpID := chi.URLParam(r, "kp_id")

	var req model.MarkMasteryReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.Level != "mastered" && req.Level != "familiar" && req.Level != "not_mastered" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "level must be 'mastered', 'familiar', or 'not_mastered'")
		return
	}

	if err := h.pg.UpdateMarkMastery(userID, kpID, req.Level); err != nil {
		log.Printf("MarkMastery error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to mark mastery")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "level": req.Level})
}

func (h *Handler) GenerateReviewPack(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	userID := middleware.GetUserID(r.Context())

	var req model.ReviewPackReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}

	var packContent string
	if len(req.KpIDs) > 0 {
		packContent = fmt.Sprintf("Review pack for user %s covering %d knowledge points", userID, len(req.KpIDs))
	} else {
		masteries, err := h.pg.GetUserMastery(userID)
		if err != nil {
			log.Printf("GetUserMastery error: %v", err)
			h.incError()
			writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to get mastery")
			return
		}
		count := req.Count
		if count <= 0 {
			count = 3
		}
		candidates := engine.SelectPushCandidates(masteries, h.forgettingCurveS, count, 0)
		kpIDs := make([]string, len(candidates))
		for i, c := range candidates {
			kpIDs[i] = c.KpID
		}
		desc := fmt.Sprintf("Mastery scores - ", userID)
		for i, c := range candidates {
			if i > 0 {
				desc += "; "
			}
			desc += fmt.Sprintf("kp %s: score=%.1f, retention=%.1f%%", c.KpID[:8], c.Score, c.R)
		}
		packContent = desc
		_ = kpIDs
	}

	writeJSON(w, http.StatusOK, model.ReviewPackResponse{
		PackID:  fmt.Sprintf("pack_%d", time.Now().Unix()),
		Content: packContent,
	})
}

func (h *Handler) GeneratePushTasks(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	userID := middleware.GetUserID(r.Context())

	users := []string{userID}
	if userID == "" {
		var err error
		users, err = h.pg.GetUsersForPush()
		if err != nil {
			log.Printf("GetUsersForPush error: %v", err)
			h.incError()
			writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to get users")
			return
		}
	}

	created := 0
	for _, uid := range users {
		masteries, err := h.pg.GetUserMasteryBelowThreshold(uid, 40, 60)
		if err != nil {
			log.Printf("GetUserMasteryBelowThreshold error for %s: %v", uid, err)
			continue
		}

		candidates := engine.SelectPushCandidates(masteries, h.forgettingCurveS, h.pushTaskLimit, 0)
		if len(candidates) == 0 {
			continue
		}

		var tasks []model.PushTask
		for _, c := range candidates {
			urgency := (100 - c.Score) + (100 - c.R)
			content := fmt.Sprintf("Review knowledge point %s (score: %.1f, retention: %.1f%%, urgency: %.0f)", c.KpID[:8], c.Score, c.R, urgency)
			tasks = append(tasks, model.PushTask{
				UserID: c.UserID,
				KpIDs:  []string{c.KpID},
				Content: content,
				Status: "pending",
			})
		}

		if err := h.pg.CreatePushTasks(tasks); err != nil {
			log.Printf("CreatePushTasks error for %s: %v", uid, err)
			continue
		}

		ttl := time.Until(time.Now().Truncate(24*time.Hour).Add(48 * time.Hour))
		if err := h.rd.SetPushTasks(uid, tasks, ttl); err != nil {
			log.Printf("redis cache push tasks error for %s: %v", uid, err)
		}
		created += len(tasks)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"created": created,
	})
}

func (h *Handler) CalculateMastery(w http.ResponseWriter, r *http.Request) {
	h.incRequest()
	userID := middleware.GetUserID(r.Context())

	tenantID := middleware.GetTenantID(r.Context())

	kps, err := h.pg.GetKnowledgePoints(tenantID)
	if err != nil {
		log.Printf("GetKnowledgePoints error: %v", err)
		h.incError()
		writeError(w, http.StatusInternalServerError, "INTERNAL", "failed to get knowledge points")
		return
	}

	updated := 0
	for _, kp := range kps {
		existing, err := h.pg.GetUserMasteryByKp(userID, kp.ID)
		if err != nil {
			continue
		}

		lastCalc := time.Now()
		if existing != nil {
			lastCalc = existing.LastCalculatedAt
		}

		markLevel := ""
		if existing != nil && existing.SMark > 0 {
			if existing.SMark >= 100 {
				markLevel = "mastered"
			} else if existing.SMark >= 40 {
				markLevel = "familiar"
			}
		}

		since := time.Now().Add(-30 * 24 * time.Hour)
		freqCount, _ := h.mongo.CountEvents(r.Context(), userID, "question_asked", since)
		quizAccuracy, _ := h.mongo.GetQuizAccuracy(r.Context(), userID, kp.ID)
		bookmarkCount, _ := h.mongo.CountEvents(r.Context(), userID, "bookmark", since)
		annotationCount, _ := h.mongo.CountEvents(r.Context(), userID, "annotation", since)
		outlineCount, _ := h.mongo.CountEvents(r.Context(), userID, "outline_generated", since)

		elapsed := time.Since(lastCalc)
		retentionRate := engine.RetentionRate(elapsed, h.forgettingCurveS)

		factors := engine.CalculateMasteryFactors(
			markLevel,
			quizAccuracy,
			freqCount,
			30,
			retentionRate,
			bookmarkCount,
			annotationCount,
			outlineCount,
		)

		m := &model.UserMastery{
			UserID:          userID,
			KpID:            kp.ID,
			Score:           math.Round(factors.Score*100) / 100,
			SMark:           factors.SMark,
			SQuiz:           factors.SQuiz,
			SFreq:           factors.SFreq,
			SRetention:      factors.SRetention,
			SDepth:          factors.SDepth,
			LastCalculatedAt: time.Now(),
		}

		if err := h.pg.UpsertMastery(m); err != nil {
			log.Printf("UpsertMastery error for kp %s: %v", kp.ID, err)
			continue
		}
		updated++
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"updated": updated,
	})
}

func (h *Handler) Healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
	errPG := h.pg.Ping()
	errRedis := error(nil)
	errMongo := error(nil)
	errKafka := error(nil)
	if h.rd != nil {
		errRedis = h.rd.Ping()
	}
	if h.mongo != nil {
		errMongo = h.mongo.Ping()
	}
	if h.kp != nil {
		errKafka = h.kp.Ping()
	}

	if errPG != nil {
		writeError(w, http.StatusServiceUnavailable, "PG_DOWN", "postgresql unreachable")
		return
	}
	if h.rd != nil && errRedis != nil {
		writeError(w, http.StatusServiceUnavailable, "REDIS_DOWN", "redis unreachable")
		return
	}
	if h.mongo != nil && errMongo != nil {
		writeError(w, http.StatusServiceUnavailable, "MONGO_DOWN", "mongodb unreachable")
		return
	}
	if h.kp != nil && errKafka != nil {
		writeError(w, http.StatusServiceUnavailable, "KAFKA_DOWN", "kafka unreachable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
