package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"admin-service/middleware"
)

func NewRouter(h *Handler, jwtSecret, adminRole string) http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestID)

	r.Get("/healthz", h.Healthz)
	r.Get("/ready", h.Ready)
	r.Get("/health", h.Health)
	r.Get("/metrics", h.Metrics)

	r.Route("/api/v1/admin", func(r chi.Router) {
		r.Use(middleware.AuthMiddleware(jwtSecret))
		r.Use(middleware.AdminMiddleware(adminRole))

		r.Get("/documents/pending", h.ListPending)
		r.Post("/documents/{id}/review", h.ReviewDocument)
		r.Get("/documents/{id}/sensitive-check", h.CheckSensitive)

		r.Get("/config", h.ListConfigs)
		r.Get("/config/{key}", h.GetConfig)
		r.Put("/config", h.UpdateConfig)

		r.Post("/search/rebuild-index", h.RebuildIndex)

		r.Get("/stats/system", h.SystemStats)

		r.Get("/sensitive-words", h.ListSensitiveWords)
		r.Post("/sensitive-words", h.AddSensitiveWord)
		r.Delete("/sensitive-words/{word}", h.DeleteSensitiveWord)

		r.Get("/index-jobs", h.ListIndexJobs)
	})

	return r
}
