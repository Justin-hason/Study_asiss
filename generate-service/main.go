package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"generate-service/api"
	"generate-service/audit"
	"generate-service/config"
	"generate-service/llm"
	"generate-service/store"
)

func main() {
	cfg := config.Load()
	metrics := &api.Metrics{}

	redisStore, err := store.NewRedisStore(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	if err != nil {
		log.Fatalf("failed to connect to redis: %v", err)
	}
	defer redisStore.Close()
	log.Printf("[generate] connected to redis at %s", cfg.RedisAddr)

	factory := llm.NewFactory(cfg.DefaultModel, cfg.FallbackModel, cfg.RetryCount, cfg.RetryBaseDelay)

	for name, modelCfg := range cfg.Models {
		if err := factory.RegisterModel(modelCfg); err != nil {
			log.Printf("[generate] warning: failed to register model %s: %v", name, err)
		} else {
			log.Printf("[generate] registered model: %s (%s/%s)", name, modelCfg.Provider, modelCfg.ModelID)
		}
	}

	auditor := audit.NewAuditor(0.15)

	router := api.NewRouter(
		factory,
		redisStore,
		auditor,
		cfg.DefaultModel,
		cfg.RequestTimeout,
		cfg.StreamTimeout,
		cfg.JWTSecret,
		metrics,
	)

	srv := &http.Server{
		Addr:         cfg.ServerAddr,
		Handler:      router,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("[generate] server starting on %s", cfg.ServerAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[generate] server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Printf("[generate] shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("[generate] shutdown error: %v", err)
	}
	log.Printf("[generate] stopped")
}
