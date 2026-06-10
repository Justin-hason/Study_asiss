package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"search-service/middleware"
)

func NewRouter(h *Handler, jwtSecret string) http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestID)

	r.Get("/healthz", h.Healthz)
	r.Get("/metrics", promhttp.Handler().ServeHTTP)

	r.Get("/internal/milvus/health", h.MilvusHealth)
	r.Get("/internal/es/health", h.ESHealth)
	r.Get("/internal/reranker/health", h.RerankerHealth)

	r.Route("/api/v1/search", func(r chi.Router) {
		r.Use(middleware.AuthMiddleware(jwtSecret))
		r.Post("/", h.Search)
	})

	return r
}
