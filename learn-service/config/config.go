package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	ServerAddr      string
	PostgresDSN     string
	RedisAddr       string
	RedisPassword   string
	RedisDB         int
	MongoURI        string
	MongoDB         string
	KafkaBrokers    string
	KafkaTopic      string
	KafkaDLQ        string
	KafkaGroupID    string
	JWTSecret       string
	ForgettingCurveS   float64
	PushTaskLimit      int
	MasteryCalcInterval time.Duration
}

func Load() *Config {
	return &Config{
		ServerAddr:      getEnv("SERVER_ADDR", ":8000"),
		PostgresDSN:     getEnv("POSTGRES_DSN", "postgres://postgres:postgres@localhost:5432/knowledge?sslmode=disable"),
		RedisAddr:       getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:   getEnv("REDIS_PASSWORD", ""),
		RedisDB:         getEnvInt("REDIS_DB", 0),
		MongoURI:        getEnv("MONGO_URI", "mongodb://localhost:27017"),
		MongoDB:         getEnv("MONGO_DB", "learn"),
		KafkaBrokers:    getEnv("KAFKA_BROKERS", "localhost:9092"),
		KafkaTopic:      getEnv("KAFKA_TOPIC", "learning-events"),
		KafkaDLQ:        getEnv("KAFKA_DLQ", "learning-events-dlq"),
		KafkaGroupID:    getEnv("KAFKA_GROUP_ID", "learn-workers"),
		JWTSecret:       getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		ForgettingCurveS: getEnvFloat("FORGETTING_CURVE_S", 7.0),
		PushTaskLimit:    getEnvInt("PUSH_TASK_LIMIT", 3),
		MasteryCalcInterval: getEnvDur("MASTERY_CALC_INTERVAL", "1h"),
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
