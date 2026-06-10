package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	ServerAddr     string
	GRPCAddr       string
	PostgresDSN    string
	RedisAddr      string
	RedisPassword  string
	RedisDB        int
	JWTSecret      string
	PermCacheTTL   time.Duration
	AccessCacheTTL time.Duration
}

func Load() *Config {
	return &Config{
		ServerAddr:     getEnv("SERVER_ADDR", ":8000"),
		GRPCAddr:       getEnv("GRPC_ADDR", ":9000"),
		PostgresDSN:    getEnv("POSTGRES_DSN", "postgres://postgres:postgres@localhost:5432/knowledge?sslmode=disable"),
		RedisAddr:      getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:  getEnv("REDIS_PASSWORD", ""),
		RedisDB:        getEnvInt("REDIS_DB", 0),
		JWTSecret:      getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		PermCacheTTL:   getEnvDur("PERM_CACHE_TTL", 5*time.Minute),
		AccessCacheTTL: getEnvDur("ACCESS_CACHE_TTL", 3*time.Minute),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvDur(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}
