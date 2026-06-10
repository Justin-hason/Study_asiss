package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"generate-service/model"
)

const sessionTTL = 7 * 24 * time.Hour

type RedisStore struct {
	client *redis.Client
}

func NewRedisStore(addr, password string, db int) (*RedisStore, error) {
	client := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		PoolSize:     20,
		MinIdleConns: 5,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
	})
	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return &RedisStore{client: client}, nil
}

func historyKey(sessionID string) string {
	return fmt.Sprintf("session:%s:history", sessionID)
}

func (s *RedisStore) AppendMessage(ctx context.Context, sessionID string, msg model.ChatMessage) error {
	key := historyKey(sessionID)
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal message: %w", err)
	}
	if err := s.client.RPush(ctx, key, data).Err(); err != nil {
		return fmt.Errorf("rpush history: %w", err)
	}
	s.client.Expire(ctx, key, sessionTTL)
	return nil
}

func (s *RedisStore) GetHistory(ctx context.Context, sessionID string) ([]model.ChatMessage, error) {
	key := historyKey(sessionID)
	raw, err := s.client.LRange(ctx, key, 0, -1).Result()
	if err != nil {
		return nil, fmt.Errorf("lrange history: %w", err)
	}
	messages := make([]model.ChatMessage, 0, len(raw))
	for _, item := range raw {
		var msg model.ChatMessage
		if err := json.Unmarshal([]byte(item), &msg); err != nil {
			continue
		}
		messages = append(messages, msg)
	}
	if len(messages) > 0 {
		s.client.Expire(ctx, key, sessionTTL)
	}
	return messages, nil
}

func (s *RedisStore) ClearHistory(ctx context.Context, sessionID string) error {
	return s.client.Del(ctx, historyKey(sessionID)).Err()
}

func (s *RedisStore) TrimHistory(ctx context.Context, sessionID string, maxLen int) error {
	key := historyKey(sessionID)
	len, err := s.client.LLen(ctx, key).Result()
	if err != nil {
		return err
	}
	if len > int64(maxLen) {
		if err := s.client.LTrim(ctx, key, int64(len)-int64(maxLen), -1).Err(); err != nil {
			return err
		}
	}
	return nil
}

func (s *RedisStore) Ping(ctx context.Context) error {
	return s.client.Ping(ctx).Err()
}

func (s *RedisStore) Close() error {
	return s.client.Close()
}
