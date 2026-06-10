package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/segmentio/kafka-go"

	"learn-service/api"
	"learn-service/config"
	"learn-service/model"
	"learn-service/store"
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
		r, err := store.NewRedisStore(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
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

	var mongo *store.MongoStore
	if cfg.MongoURI != "" {
		m, err := store.NewMongoStore(cfg.MongoURI, cfg.MongoDB)
		if err != nil {
			log.Printf("warning: mongodb not available, running without mongo: %v", err)
		} else {
			mongo = m
			log.Println("mongodb connected")
			if err := mongo.EnsureIndexes(); err != nil {
				log.Printf("warning: mongo indexes: %v", err)
			}
		}
	}
	if mongo != nil {
		defer mongo.Close()
	}

	var kafkaProducer *store.KafkaProducer
	if cfg.KafkaBrokers != "" {
		if err := store.EnsureKafkaTopics(cfg.KafkaBrokers); err != nil {
			log.Printf("warning: kafka topic setup: %v", err)
		}
		kafkaProducer = store.NewKafkaProducer(cfg.KafkaBrokers, cfg.KafkaTopic)
		log.Printf("kafka producer connected to %s topic %s", cfg.KafkaBrokers, cfg.KafkaTopic)
	}
	if kafkaProducer != nil {
		defer kafkaProducer.Close()
	}

	kafkaConsumer := store.NewKafkaConsumer(cfg.KafkaBrokers, cfg.KafkaTopic, cfg.KafkaGroupID, cfg.KafkaDLQ)
	log.Printf("kafka consumer started on %s topic %s group %s", cfg.KafkaBrokers, cfg.KafkaTopic, cfg.KafkaGroupID)

	handler := api.NewHandler(pg, redis, mongo, kafkaProducer, cfg.MasteryCalcInterval, cfg.ForgettingCurveS, cfg.PushTaskLimit)
	router := api.NewRouter(handler, cfg.JWTSecret)

	httpServer := &http.Server{
		Addr:    cfg.ServerAddr,
		Handler: router,
	}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		consumeEvents(kafkaConsumer, mongo)
	}()

	go func() {
		log.Printf("[learn] server starting on %s", cfg.ServerAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[learn] server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[learn] shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	httpServer.Shutdown(ctx)
	kafkaConsumer.Close()
	wg.Wait()
	log.Println("[learn] stopped")
}

func consumeEvents(consumer *store.KafkaConsumer, mongo *store.MongoStore) {
	if mongo == nil {
		log.Println("mongo not available, skipping event consumption")
		return
	}

	ctx := context.Background()
	log.Println("[learn] event consumer started")

	for {
		msg, err := consumer.FetchMessage(ctx)
		if err != nil {
			log.Printf("[learn] consumer fetch error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		if err := processEvent(msg, mongo); err != nil {
			log.Printf("[learn] process event error: %v, sending to DLQ", err)

			dlqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			retryErr := retry(3, time.Second, func() error {
				return consumer.SendToDLQ(dlqCtx, msg, err.Error())
			})
			cancel()
			if retryErr != nil {
				log.Printf("[learn] failed to send to DLQ after retries: %v", retryErr)
			}
		}

		if err := consumer.CommitMessage(ctx, msg); err != nil {
			log.Printf("[learn] commit error: %v", err)
		}
	}
}

func processEvent(msg kafka.Message, mongo *store.MongoStore) error {
	var eventData map[string]interface{}
	if err := json.Unmarshal(msg.Value, &eventData); err != nil {
		return err
	}

	userID, _ := eventData["user_id"].(string)
	tenantID, _ := eventData["tenant_id"].(string)
	eventType, _ := eventData["event_type"].(string)
	timestampStr, _ := eventData["timestamp"].(string)
	sessionID, _ := eventData["session_id"].(string)

	var ts time.Time
	if timestampStr != "" {
		ts, _ = time.Parse(time.RFC3339, timestampStr)
	}
	if ts.IsZero() {
		ts = time.Now()
	}

	var payload map[string]interface{}
	if pBytes, ok := eventData["payload"].([]byte); ok {
		json.Unmarshal(pBytes, &payload)
	} else if pMap, ok := eventData["payload"].(map[string]interface{}); ok {
		payload = pMap
	}

	event := &model.LearningEvent{
		EventID:   fmt.Sprintf("evt_%d_%s", time.Now().UnixNano(), userID),
		UserID:    userID,
		TenantID:  tenantID,
		EventType: eventType,
		Timestamp: ts,
		SessionID: sessionID,
		Payload:    payload,
		CreatedAt: time.Now(),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return mongo.InsertEvent(ctx, event)
}

func retry(attempts int, delay time.Duration, fn func() error) error {
	var err error
	for i := 0; i < attempts; i++ {
		if err = fn(); err == nil {
			return nil
		}
		time.Sleep(delay)
	}
	return err
}
