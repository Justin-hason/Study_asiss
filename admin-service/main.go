package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"admin-service/api"
	"admin-service/config"
	"admin-service/store"
)

func main() {
	cfg := config.Load()

	pg, err := store.NewPostgresStore(cfg.PostgresDSN)
	if err != nil {
		log.Fatalf("failed to connect to postgres: %v", err)
	}
	defer pg.Close()

	if err := pg.RunMigrations(); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}
	log.Println("database migrations applied")

	var redis *store.RedisStore
	if cfg.RedisAddr != "" {
		r, err := store.NewRedisStore(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
		if err != nil {
			log.Printf("warning: redis not available, running without cache: %v", err)
		} else {
			redis = r
			log.Println("redis connected")
		}
	}
	if redis != nil {
		defer redis.Close()
	}

	serviceURLs := map[string]string{
		"knowledge": cfg.KnowledgeServiceURL,
		"generate":  cfg.GenerateServiceURL,
		"search":    cfg.SearchServiceURL,
		"pipeline":  cfg.PipelineServiceURL,
		"learn":     cfg.LearnServiceURL,
	}

	h := api.NewHandler(pg, redis, cfg.SensitiveWords, serviceURLs)
	router := api.NewRouter(h, cfg.JWTSecret, cfg.AdminRole)

	httpServer := &http.Server{
		Addr:    cfg.ServerAddr,
		Handler: router,
	}

	go func() {
		log.Printf("[admin] server starting on %s", cfg.ServerAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[admin] server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[admin] shutting down...")
	httpServer.Close()
	log.Println("[admin] stopped")
}
