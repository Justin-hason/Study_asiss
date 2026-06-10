package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"knowledge-service/middleware"
)

func NewRouter(h *Handler, jwtSecret string) http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestID)

	r.Get("/healthz", h.Healthz)
	r.Get("/ready", h.Ready)

	r.Route("/api/v1/knowledge", func(r chi.Router) {
		r.Use(middleware.AuthMiddleware(jwtSecret))

		r.Post("/folders", h.CreateFolder)
		r.Get("/folders/tree", h.GetFolderTree)
		r.Put("/folders/{id}/move", h.MoveFolder)
		r.Delete("/folders/{id}", h.DeleteFolder)

		r.Post("/tags", h.CreateTag)
		r.Get("/tags", h.ListTags)

		r.Post("/documents/{id}/tags/{tagId}", h.AddDocumentTag)
		r.Delete("/documents/{id}/tags/{tagId}", h.RemoveDocumentTag)
		r.Put("/documents/{id}/permissions", h.SetPermissions)
		r.Post("/documents/{id}/share", h.CreateShareLink)
		r.Get("/documents/{id}/versions", h.ListVersions)
		r.Post("/documents/{id}/versions/{versionId}/restore", h.RestoreVersion)
	})

	r.Post("/api/v1/knowledge/share/{token}", h.VerifyShareLink)

	return r
}
