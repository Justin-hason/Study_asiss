package store

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisStore struct {
	cli            *redis.Client
	permTTL        time.Duration
	accessTTL      time.Duration
}

func NewRedisStore(addr, password string, db int, permTTL, accessTTL time.Duration) (*RedisStore, error) {
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
	return &RedisStore{cli: cli, permTTL: permTTL, accessTTL: accessTTL}, nil
}

func (r *RedisStore) Close() error {
	return r.cli.Close()
}

func (r *RedisStore) Ping() error {
	return r.cli.Ping(context.Background()).Err()
}

func permKey(userID, docID string) string {
	return fmt.Sprintf("perm:%s:%s", userID, docID)
}

func accessKey(userID string) string {
	return fmt.Sprintf("accessible:%s", userID)
}

func (r *RedisStore) GetCachedPermission(userID, docID string) (string, error) {
	val, err := r.cli.Get(context.Background(), permKey(userID, docID)).Result()
	if err == redis.Nil {
		return "", nil
	}
	return val, err
}

func (r *RedisStore) SetCachedPermission(userID, docID, level string) error {
	return r.cli.Set(context.Background(), permKey(userID, docID), level, r.permTTL).Err()
}

func (r *RedisStore) GetCachedAccessibleDocs(userID string) ([]string, error) {
	val, err := r.cli.Get(context.Background(), accessKey(userID)).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return parseStringSlice(val), nil
}

func (r *RedisStore) SetCachedAccessibleDocs(userID string, docIDs []string) error {
	return r.cli.Set(context.Background(), accessKey(userID), joinStrings(docIDs), r.accessTTL).Err()
}

func (r *RedisStore) InvalidatePermissionCache(docID string) error {
	var cursor uint64
	pattern := fmt.Sprintf("perm:*:%s", docID)
	for {
		keys, nextCursor, err := r.cli.Scan(context.Background(), cursor, pattern, 100).Result()
		if err != nil {
			return err
		}
		if len(keys) > 0 {
			r.cli.Del(context.Background(), keys...)
		}
		if nextCursor == 0 {
			break
		}
		cursor = nextCursor
	}
	return nil
}

func (r *RedisStore) InvalidateAccessibleCache(userID string) error {
	return r.cli.Del(context.Background(), accessKey(userID)).Err()
}

func joinStrings(ss []string) string {
	if len(ss) == 0 {
		return ""
	}
	b := make([]byte, 0, len(ss)*38)
	for i, s := range ss {
		if i > 0 {
			b = append(b, ',')
		}
		b = append(b, s...)
	}
	return string(b)
}

func parseStringSlice(s string) []string {
	if s == "" {
		return nil
	}
	result := make([]string, 0, 64)
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
