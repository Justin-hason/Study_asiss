package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"generate-service/audit"
	"generate-service/llm"
	authmw "generate-service/middleware"
	"generate-service/store"
)

type Metrics struct {
	RequestCount      atomic.Int64
	TokenCount        atomic.Int64
	HallucinationCount atomic.Int64
	DegradationCount  atomic.Int64
	SuccessCalls      atomic.Int64
	TotalCalls        atomic.Int64
}

func NewRouter(
	factory *llm.Factory,
	redis *store.RedisStore,
	auditor *audit.Auditor,
	defaultModel string,
	requestTimeout, streamTimeout time.Duration,
	jwtSecret string,
	metrics *Metrics,
) http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)

	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			mrw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
			next.ServeHTTP(mrw, r)
			duration := time.Since(start)
			metrics.RequestCount.Add(1)
			metrics.TotalCalls.Add(1)
			if mrw.statusCode < 500 {
				metrics.SuccessCalls.Add(1)
			}
			_ = duration
		})
	})

	handler := NewHandler(factory, redis, auditor, defaultModel, requestTimeout, streamTimeout, metrics)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := redis.Ping(r.Context()); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{"status": "not ready", "reason": "redis unreachable"})
			return
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	r.Get("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		rc := metrics.RequestCount.Load()
		sc := metrics.SuccessCalls.Load()
		tc := metrics.TotalCalls.Load()
		var successRate float64 = 1.0
		if tc > 0 {
			successRate = float64(sc) / float64(tc)
		}
		fmt.Fprintf(w, "# HELP generate_requests_total Total number of generate requests\n")
		fmt.Fprintf(w, "# TYPE generate_requests_total counter\n")
		fmt.Fprintf(w, "generate_requests_total %d\n", rc)
		fmt.Fprintf(w, "# HELP generate_tokens_total Total tokens consumed\n")
		fmt.Fprintf(w, "# TYPE generate_tokens_total counter\n")
		fmt.Fprintf(w, "generate_tokens_total %d\n", metrics.TokenCount.Load())
		fmt.Fprintf(w, "# HELP generate_hallucinations_total Total hallucination interceptions\n")
		fmt.Fprintf(w, "# TYPE generate_hallucinations_total counter\n")
		fmt.Fprintf(w, "generate_hallucinations_total %d\n", metrics.HallucinationCount.Load())
		fmt.Fprintf(w, "# HELP generate_degradations_total Total degradation events\n")
		fmt.Fprintf(w, "# TYPE generate_degradations_total counter\n")
		fmt.Fprintf(w, "generate_degradations_total %d\n", metrics.DegradationCount.Load())
		fmt.Fprintf(w, "# HELP generate_model_call_success_rate Model call success rate\n")
		fmt.Fprintf(w, "# TYPE generate_model_call_success_rate gauge\n")
		fmt.Fprintf(w, "generate_model_call_success_rate %.4f\n", successRate)
	})

	qa := r.Group(nil)
	qa.Use(authmw.AuthMiddleware(jwtSecret))

	qa.Post("/api/v1/qa/ask", handler.HandleAsk)
	qa.Get("/api/v1/qa/history", handler.HandleHistory)
	qa.Delete("/api/v1/qa/history/{session_id}", handler.HandleDeleteHistory)

	return r
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Flush() {
	if f, ok := rw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
