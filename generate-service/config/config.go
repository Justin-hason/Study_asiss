package config

import (
	"os"
	"strconv"
	"strings"
	"time"

	"generate-service/model"
)

type Config struct {
	ServerAddr    string
	RedisAddr     string
	RedisPassword string
	RedisDB       int
	JWTSecret     string

	DefaultModel       string
	FallbackModel      string
	ModelSwitchRetries int
	ModelSwitchWindow  time.Duration

	RequestTimeout  time.Duration
	StreamTimeout   time.Duration
	RetryCount      int
	RetryBaseDelay  time.Duration
	MaxIdleConns    int
	IdleConnTimeout time.Duration

	Models    map[string]model.ModelConfig
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

func Load() *Config {
	cfg := &Config{
		ServerAddr:         getEnv("SERVER_ADDR", ":8000"),
		RedisAddr:          getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:      getEnv("REDIS_PASSWORD", ""),
		RedisDB:            getEnvInt("REDIS_DB", 0),
		JWTSecret:          getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		DefaultModel:       getEnv("DEFAULT_MODEL", "default"),
		FallbackModel:      getEnv("FALLBACK_MODEL", "gpt-3.5-turbo"),
		ModelSwitchRetries: getEnvInt("MODEL_SWITCH_RETRIES", 3),
		ModelSwitchWindow:  getEnvDur("MODEL_SWITCH_WINDOW", 5*time.Minute),
		RequestTimeout:     getEnvDur("REQUEST_TIMEOUT", 30*time.Second),
		StreamTimeout:      getEnvDur("STREAM_TIMEOUT", 10*time.Second),
		RetryCount:         getEnvInt("RETRY_COUNT", 2),
		RetryBaseDelay:     getEnvDur("RETRY_BASE_DELAY", 1*time.Second),
		MaxIdleConns:       getEnvInt("MAX_IDLE_CONNS", 100),
		IdleConnTimeout:    getEnvDur("IDLE_CONN_TIMEOUT", 90*time.Second),
	}
	cfg.loadModels()
	return cfg
}

func (cfg *Config) loadModels() {
	cfg.Models = make(map[string]model.ModelConfig)

	defaultModels := []model.ModelConfig{
		{
			Name:        "default",
			Provider:    getEnv("MODEL_DEFAULT_PROVIDER", "openai"),
			ModelID:     getEnv("MODEL_DEFAULT_ID", "gpt-4o"),
			BaseURL:     getEnv("MODEL_DEFAULT_BASE_URL", "https://api.openai.com/v1"),
			APIKey:      getEnv("MODEL_DEFAULT_API_KEY", ""),
			Timeout:     getEnvDur("MODEL_DEFAULT_TIMEOUT", 30*time.Second),
			MaxTokens:   getEnvInt("MODEL_DEFAULT_MAX_TOKENS", 2048),
			Temperature: 0.3,
			Enabled:     true,
		},
		{
			Name:        "gpt-4o",
			Provider:    "openai",
			ModelID:     "gpt-4o",
			BaseURL:     getEnv("MODEL_GPT4O_BASE_URL", "https://api.openai.com/v1"),
			APIKey:      getEnv("MODEL_GPT4O_API_KEY", ""),
			Timeout:     getEnvDur("MODEL_GPT4O_TIMEOUT", 30*time.Second),
			MaxTokens:   getEnvInt("MODEL_GPT4O_MAX_TOKENS", 2048),
			Temperature: 0.3,
			Enabled:     true,
		},
		{
			Name:        "gpt-3.5-turbo",
			Provider:    "openai",
			ModelID:     "gpt-3.5-turbo",
			BaseURL:     getEnv("MODEL_GPT35_BASE_URL", "https://api.openai.com/v1"),
			APIKey:      getEnv("MODEL_GPT35_API_KEY", ""),
			Timeout:     getEnvDur("MODEL_GPT35_TIMEOUT", 30*time.Second),
			MaxTokens:   getEnvInt("MODEL_GPT35_MAX_TOKENS", 2048),
			Temperature: 0.3,
			Enabled:     true,
		},
		{
			Name:        "claude-3.5-sonnet",
			Provider:    "claude",
			ModelID:     "claude-3-5-sonnet-20241022",
			BaseURL:     getEnv("MODEL_CLAUDE_BASE_URL", "https://api.anthropic.com/v1"),
			APIKey:      getEnv("MODEL_CLAUDE_API_KEY", ""),
			Timeout:     getEnvDur("MODEL_CLAUDE_TIMEOUT", 60*time.Second),
			MaxTokens:   getEnvInt("MODEL_CLAUDE_MAX_TOKENS", 4096),
			Temperature: 0.3,
			Enabled:     getEnv("MODEL_CLAUDE_API_KEY", "") != "",
		},
	}

	for _, m := range defaultModels {
		cfg.Models[m.Name] = m
	}

	if custom := getEnv("MODEL_CUSTOM_LIST", ""); custom != "" {
		for _, name := range strings.Split(custom, ",") {
			name = strings.TrimSpace(name)
			if name == "" {
				continue
			}
			prefix := "MODEL_" + strings.ToUpper(strings.ReplaceAll(name, "-", "_"))
			cfg.Models[name] = model.ModelConfig{
				Name:        name,
				Provider:    getEnv(prefix+"_PROVIDER", "openai"),
				ModelID:     getEnv(prefix+"_ID", name),
				BaseURL:     getEnv(prefix+"_BASE_URL", "https://api.openai.com/v1"),
				APIKey:      getEnv(prefix+"_API_KEY", ""),
				Timeout:     getEnvDur(prefix+"_TIMEOUT", 30*time.Second),
				MaxTokens:   getEnvInt(prefix+"_MAX_TOKENS", 2048),
				Temperature: getEnvFloat(prefix+"_TEMPERATURE", 0.3),
				Enabled:     getEnv(prefix+"_ENABLED", "true") == "true",
			}
		}
	}
}

func getEnvFloat(key string, fallback float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}
