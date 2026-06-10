package store

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

type KafkaProducer struct {
	writer *kafka.Writer
}

func NewKafkaProducer(brokers, topic string) *KafkaProducer {
	w := &kafka.Writer{
		Addr:         kafka.TCP(brokers),
		Topic:        topic,
		Balancer:     &kafka.Hash{},
		BatchTimeout: 10 * time.Millisecond,
		Async:        true,
	}
	return &KafkaProducer{writer: w}
}

func (p *KafkaProducer) Close() error {
	return p.writer.Close()
}

func (p *KafkaProducer) WriteMessages(ctx context.Context, msgs ...kafka.Message) error {
	return p.writer.WriteMessages(ctx, msgs...)
}

type KafkaConsumer struct {
	reader *kafka.Reader
	dlq    *kafka.Writer
}

func NewKafkaConsumer(brokers, topic, groupID, dlqTopic string) *KafkaConsumer {
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     []string{brokers},
		Topic:       topic,
		GroupID:     groupID,
		MinBytes:    10,
		MaxBytes:    10e6,
		MaxWait:     1 * time.Second,
		StartOffset: kafka.LastOffset,
	})

	dlq := &kafka.Writer{
		Addr:         kafka.TCP(brokers),
		Topic:        dlqTopic,
		Balancer:     &kafka.Hash{},
		BatchTimeout: 10 * time.Millisecond,
		Async:        true,
	}

	return &KafkaConsumer{reader: r, dlq: dlq}
}

func (c *KafkaConsumer) Close() error {
	if err := c.reader.Close(); err != nil {
		return err
	}
	return c.dlq.Close()
}

func (c *KafkaConsumer) FetchMessage(ctx context.Context) (kafka.Message, error) {
	return c.reader.FetchMessage(ctx)
}

func (c *KafkaConsumer) CommitMessage(ctx context.Context, msg kafka.Message) error {
	return c.reader.CommitMessages(ctx, msg)
}

func (c *KafkaConsumer) SendToDLQ(ctx context.Context, msg kafka.Message, errMsg string) error {
	headers := append(msg.Headers, kafka.Header{
		Key:   "error",
		Value: []byte(errMsg),
	}, kafka.Header{
		Key:   "original_topic",
		Value: []byte(msg.Topic),
	})

	dlqMsg := kafka.Message{
		Key:     msg.Key,
		Value:   msg.Value,
		Headers: headers,
		Time:    time.Now(),
	}

	return c.dlq.WriteMessages(ctx, dlqMsg)
}

func EnsureKafkaTopics(brokers string) error {
	conn, err := kafka.Dial("tcp", brokers)
	if err != nil {
		return fmt.Errorf("kafka dial: %w", err)
	}
	defer conn.Close()

	topics := []string{"learning-events", "learning-events-dlq"}
	for _, topic := range topics {
		exists, err := topicExists(conn, topic)
		if err != nil {
			log.Printf("check topic %s: %v", topic, err)
			continue
		}
		if !exists {
			log.Printf("creating kafka topic: %s", topic)
			if err := createTopic(conn, topic); err != nil {
				log.Printf("create topic %s: %v", topic, err)
			}
		}
	}
	return nil
}

func topicExists(conn *kafka.Conn, name string) (bool, error) {
	partitions, err := conn.ReadPartitions()
	if err != nil {
		return false, err
	}
	for _, p := range partitions {
		if p.Topic == name {
			return true, nil
		}
	}
	return false, nil
}

func createTopic(conn *kafka.Conn, name string) error {
	controller, err := conn.Controller()
	if err != nil {
		return fmt.Errorf("get controller: %w", err)
	}
	controllerConn, err := kafka.Dial("tcp", controller.Host+":"+controller.Port)
	if err != nil {
		return fmt.Errorf("dial controller: %w", err)
	}
	defer controllerConn.Close()

	topicConfigs := []kafka.TopicConfig{
		{
			Topic:             name,
			NumPartitions:     3,
			ReplicationFactor: 1,
		},
	}
	return controllerConn.CreateTopics(topicConfigs...)
}

func (p *KafkaProducer) Ping() error {
	conn, err := kafka.Dial("tcp", p.writer.Addr.String())
	if err != nil {
		return err
	}
	conn.Close()
	return nil
}

func (c *KafkaConsumer) Ping() error {
	conn, err := kafka.Dial("tcp", c.reader.Config().Brokers[0])
	if err != nil {
		return err
	}
	conn.Close()
	return nil
}
