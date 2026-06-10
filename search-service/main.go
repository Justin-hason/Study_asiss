package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"search-service/api"
	"search-service/config"
	"search-service/search"
)

func main() {
	cfg := config.Load()

	svc, err := search.NewService(cfg)
	if err != nil {
		log.Fatalf("[search] failed to initialize search service: %v", err)
	}
	defer svc.Close()
	log.Println("[search] service initialized")

	h := api.NewHandler(svc)
	router := api.NewRouter(h, cfg.JWTSecret)

	httpServer := &http.Server{
		Addr:    cfg.ServerAddr,
		Handler: router,
	}

	go func() {
		log.Printf("[search] server starting on %s", cfg.ServerAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[search] server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[search] shutting down...")
	httpServer.Close()
	log.Println("[search] stopped")
}
