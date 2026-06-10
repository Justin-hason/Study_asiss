package llm

import (
	"context"
	"fmt"
	"sync"
	"time"

	"generate-service/model"
)

type LLMClient interface {
	Generate(ctx context.Context, req model.GenerateRequest) (*model.GenerateResponse, error)
	GenerateStream(ctx context.Context, req model.GenerateRequest) (<-chan model.StreamChunk, error)
}

type Factory struct {
	mu      sync.RWMutex
	clients map[string]LLMClient
	configs map[string]model.ModelConfig

	defaultModel  string
	fallbackModel string
	retryCount    int
	retryDelay    time.Duration
}

func NewFactory(defaultModel, fallbackModel string, retryCount int, retryDelay time.Duration) *Factory {
	return &Factory{
		clients:       make(map[string]LLMClient),
		configs:       make(map[string]model.ModelConfig),
		defaultModel:  defaultModel,
		fallbackModel: fallbackModel,
		retryCount:    retryCount,
		retryDelay:    retryDelay,
	}
}

func (f *Factory) RegisterModel(cfg model.ModelConfig) error {
	if !cfg.Enabled {
		return nil
	}
	var client LLMClient
	switch cfg.Provider {
	case "openai":
		client = NewOpenAIClient(cfg)
	case "claude":
		client = NewClaudeClient(cfg)
	case "vllm":
		client = NewVLLMClient(cfg)
	default:
		return fmt.Errorf("unknown provider: %s", cfg.Provider)
	}
	f.mu.Lock()
	f.clients[cfg.Name] = client
	f.configs[cfg.Name] = cfg
	f.mu.Unlock()
	return nil
}

func (f *Factory) GetClient(name string) (LLMClient, model.ModelConfig, bool) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	client, ok := f.clients[name]
	if !ok {
		client, ok = f.clients[f.defaultModel]
		if !ok {
			return nil, model.ModelConfig{}, false
		}
		return client, f.configs[f.defaultModel], true
	}
	return client, f.configs[name], true
}

func (f *Factory) GetFallback() (LLMClient, model.ModelConfig, bool) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	client, ok := f.clients[f.fallbackModel]
	if !ok {
		for _, c := range f.clients {
			for name, cfg := range f.configs {
				if cfg.Name == name {
					return c, cfg, true
				}
			}
		}
		return nil, model.ModelConfig{}, false
	}
	return client, f.configs[f.fallbackModel], true
}

func (f *Factory) Generate(ctx context.Context, req model.GenerateRequest) (*model.GenerateResponse, error) {
	client, cfg, ok := f.GetClient(req.Model)
	if !ok {
		return nil, fmt.Errorf("no available model client for: %s", req.Model)
	}

	req.Temperature = cfg.Temperature
	if req.MaxTokens == 0 {
		req.MaxTokens = cfg.MaxTokens
	}

	var lastErr error
	for i := 0; i <= f.retryCount; i++ {
		resp, err := client.Generate(ctx, req)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		if i < f.retryCount {
			time.Sleep(f.retryDelay * (1 << i))
		}
	}

	fallbackClient, _, ok := f.GetFallback()
	if ok && fallbackClient != client {
		return fallbackClient.Generate(ctx, req)
	}

	return nil, fmt.Errorf("all retries and fallback exhausted: %w", lastErr)
}

func (f *Factory) GenerateStream(ctx context.Context, req model.GenerateRequest) (<-chan model.StreamChunk, error) {
	client, cfg, ok := f.GetClient(req.Model)
	if !ok {
		errCh := make(chan model.StreamChunk, 1)
		errCh <- model.StreamChunk{Error: fmt.Errorf("no available model client for: %s", req.Model)}
		close(errCh)
		return errCh, nil
	}

	req.Temperature = cfg.Temperature
	if req.MaxTokens == 0 {
		req.MaxTokens = cfg.MaxTokens
	}

	ch, err := client.GenerateStream(ctx, req)
	if err != nil {
		fallbackClient, _, ok := f.GetFallback()
		if ok && fallbackClient != client {
			return fallbackClient.GenerateStream(ctx, req)
		}
		errCh := make(chan model.StreamChunk, 1)
		errCh <- model.StreamChunk{Error: err}
		close(errCh)
		return errCh, nil
	}
	return ch, nil
}
