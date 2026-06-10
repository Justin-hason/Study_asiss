package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	ServerAddr    string
	PostgresDSN   string
	RedisAddr     string
	RedisPassword string
	RedisDB       int
	JWTSecret     string
	AdminRole     string

	KnowledgeServiceURL string
	GenerateServiceURL  string
	SearchServiceURL    string
	PipelineServiceURL  string
	LearnServiceURL     string

	SensitiveWords []string
}

func Load() *Config {
	return &Config{
		ServerAddr:    getEnv("SERVER_ADDR", ":8000"),
		PostgresDSN:   getEnv("POSTGRES_DSN", "postgres://postgres:postgres@localhost:5432/knowledge?sslmode=disable"),
		RedisAddr:     getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		RedisDB:       getEnvInt("REDIS_DB", 0),
		JWTSecret:     getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		AdminRole:     getEnv("ADMIN_ROLE", "admin"),

		KnowledgeServiceURL: getEnv("KNOWLEDGE_SERVICE_URL", "http://knowledge-service:8000"),
		GenerateServiceURL:  getEnv("GENERATE_SERVICE_URL", "http://generate-service:8000"),
		SearchServiceURL:    getEnv("SEARCH_SERVICE_URL", "http://search-service:8000"),
		PipelineServiceURL:  getEnv("PIPELINE_SERVICE_URL", "http://pipeline-service:8000"),
		LearnServiceURL:     getEnv("LEARN_SERVICE_URL", "http://learn-service:8000"),

		SensitiveWords: getEnvList("SENSITIVE_WORDS", "赌博,色情,暴力,毒品,诈骗,反动"),
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

func getEnvList(key, fallback string) []string {
	v := os.Getenv(key)
	if v == "" {
		v = fallback
	}
	if v == "" {
		return nil
	}
	parts := splitCSV(v)
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = trimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

func splitCSV(s string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == ',' {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		result = append(result, s[start:])
	}
	return result
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	if start >= end {
		return ""
	}
	return s[start:end]
}
