package store

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"learn-service/model"
)

type MongoStore struct {
	client *mongo.Client
	db     *mongo.Database
}

func NewMongoStore(uri, dbName string) (*MongoStore, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, fmt.Errorf("mongo connect: %w", err)
	}
	if err := client.Ping(ctx, nil); err != nil {
		return nil, fmt.Errorf("mongo ping: %w", err)
	}
	db := client.Database(dbName)
	return &MongoStore{client: client, db: db}, nil
}

func (s *MongoStore) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.client.Disconnect(ctx)
}

func (s *MongoStore) Ping() error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return s.client.Ping(ctx, nil)
}

func (s *MongoStore) EnsureIndexes() error {
	ctx := context.Background()
	coll := s.db.Collection("learning_events")

	indexes := []mongo.IndexModel{
		{
			Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "timestamp", Value: -1}},
		},
		{
			Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "event_type", Value: 1}},
		},
		{
			Keys: bson.D{{Key: "timestamp", Value: 1}},
			Options: options.Index().SetExpireAfterSeconds(180 * 24 * 3600),
		},
	}

	_, err := coll.Indexes().CreateMany(ctx, indexes)
	return err
}

func (s *MongoStore) InsertEvent(ctx context.Context, event *model.LearningEvent) error {
	coll := s.db.Collection("learning_events")
	_, err := coll.InsertOne(ctx, event)
	return err
}

func (s *MongoStore) InsertEvents(ctx context.Context, events []interface{}) error {
	if len(events) == 0 {
		return nil
	}
	coll := s.db.Collection("learning_events")
	_, err := coll.InsertMany(ctx, events)
	return err
}

func (s *MongoStore) CountEvents(ctx context.Context, userID string, eventType string, since time.Time) (int64, error) {
	filter := bson.M{
		"user_id":   userID,
		"event_type": eventType,
		"timestamp":  bson.M{"$gte": since},
	}
	coll := s.db.Collection("learning_events")
	return coll.CountDocuments(ctx, filter)
}

func (s *MongoStore) GetQuizAccuracy(ctx context.Context, userID, kpID string) (float64, error) {
	filter := bson.M{
		"user_id":    userID,
		"event_type": "quiz_answer",
		"payload.kp_id": kpID,
	}
	coll := s.db.Collection("learning_events")
	cursor, err := coll.Find(ctx, filter)
	if err != nil {
		return 0, err
	}
	defer cursor.Close(ctx)

	var correct, total float64
	for cursor.Next(ctx) {
		var ev struct {
			Payload map[string]interface{} `bson:"payload"`
		}
		if err := cursor.Decode(&ev); err != nil {
			continue
		}
		total++
		if correctVal, ok := ev.Payload["correct"].(bool); ok && correctVal {
			correct++
		}
	}
	if total == 0 {
		return 0, nil
	}
	return correct / total, nil
}
