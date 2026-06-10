package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	ServerAddr         string
	MilvusAddr         string
	ESAddr             string
	EmbeddingServiceURL string
	RerankerServiceURL  string
	JWTSecret          string
	DefaultTopK        int
	DefaultTopN        int
	DefaultAlpha       float64
	DefaultThreshold   float64
	RRFK               int
	RRFM               int
}

func Load() *Config {
	return &Config{
		ServerAddr:          getEnv("SERVER_ADDR", ":8000"),
		MilvusAddr:          getEnv("MILVUS_ADDR", "localhost:19530"),
		ESAddr:              getEnv("ES_ADDR", "http://localhost:9200"),
		EmbeddingServiceURL: getEnv("EMBEDDING_SERVICE_URL", "http://embedding-service:8000"),
		RerankerServiceURL:  getEnv("RERANKER_SERVICE_URL", "http://reranker-service:8000"),
		JWTSecret:           getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		DefaultTopK:         getEnvInt("DEFAULT_TOP_K", 100),
		DefaultTopN:         getEnvInt("DEFAULT_TOP_N", 5),
		DefaultAlpha:        getEnvFloat("DEFAULT_ALPHA", 0.7),
		DefaultThreshold:    getEnvFloat("DEFAULT_THRESHOLD", 0.3),
		RRFK:                getEnvInt("RRF_K", 60),
		RRFM:                getEnvInt("RRF_M", 20),
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

func getEnvFloat(key string, fallback float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
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
