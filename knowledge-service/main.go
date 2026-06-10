package main

import (
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"

	"knowledge-service/api"
	"knowledge-service/config"
	grpcserver "knowledge-service/grpc"
	"knowledge-service/store"
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
		r, err := store.NewRedisStore(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB, cfg.PermCacheTTL, cfg.AccessCacheTTL)
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

	h := api.NewHandler(pg, redis)
	router := api.NewRouter(h, cfg.JWTSecret)

	httpServer := &http.Server{
		Addr:    cfg.ServerAddr,
		Handler: router,
	}

	grpcSrv := grpc.NewServer()
	gs := grpcserver.NewServer(pg, redis)
	grpcserver.Register(grpcSrv, gs)

	lis, err := net.Listen("tcp", cfg.GRPCAddr)
	if err != nil {
		log.Fatalf("failed to listen grpc: %v", err)
	}

	go func() {
		log.Printf("REST server listening on %s", cfg.ServerAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http server error: %v", err)
		}
	}()

	go func() {
		log.Printf("gRPC server listening on %s", cfg.GRPCAddr)
		if err := grpcSrv.Serve(lis); err != nil {
			log.Fatalf("grpc server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down servers...")
	grpcSrv.GracefulStop()
	httpServer.Close()
	log.Println("servers stopped")
}
