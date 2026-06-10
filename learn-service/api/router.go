package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"learn-service/middleware"
)

func NewRouter(h *Handler, jwtSecret string) http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestID)

	r.Get("/healthz", h.Healthz)
	r.Get("/ready", h.Ready)

	r.Route("/api/v1/learn", func(r chi.Router) {
		r.Use(middleware.AuthMiddleware(jwtSecret))

		r.Post("/events", h.PostEvents)
		r.Get("/mastery", h.GetMastery)
		r.Get("/push-tasks/today", h.GetTodayPushTasks)
		r.Post("/review-pack", h.GenerateReviewPack)
		r.Put("/mastery/{kp_id}/mark", h.MarkMastery)

		r.Post("/push-tasks/generate", h.GeneratePushTasks)
		r.Post("/mastery/calculate", h.CalculateMastery)
	})

	return r
}
