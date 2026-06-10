package store

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisStore struct {
	cli *redis.Client
}

func NewRedisStore(addr, password string, db int) (*RedisStore, error) {
	cli := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     20,
		MinIdleConns: 5,
	})
	if err := cli.Ping(context.Background()).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return &RedisStore{cli: cli}, nil
}

func (r *RedisStore) Close() error {
	return r.cli.Close()
}

func (r *RedisStore) Ping() error {
	return r.cli.Ping(context.Background()).Err()
}

func (r *RedisStore) SetCache(key string, value string, ttl time.Duration) error {
	return r.cli.Set(context.Background(), key, value, ttl).Err()
}

func (r *RedisStore) GetCache(key string) (string, error) {
	val, err := r.cli.Get(context.Background(), key).Result()
	if err == redis.Nil {
		return "", nil
	}
	return val, err
}

func (r *RedisStore) DeleteCache(key string) error {
	return r.cli.Del(context.Background(), key).Err()
}
