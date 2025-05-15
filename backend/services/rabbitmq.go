package services

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/streadway/amqp"
)

var (
	RabbitMQConn *amqp.Connection
	RabbitMQChan *amqp.Channel
)

const (
	ChatExchange = "chat_exchange"
	ChatQueue    = "chat_queue"
)

type MessageEvent struct {
	Type      string      `json:"type"`
	RoomID    uint        `json:"room_id"`
	UserID    uint        `json:"user_id"`
	Username  string      `json:"username"`
	Content   string      `json:"content"`
	Timestamp string      `json:"timestamp"`
	Data      interface{} `json:"data,omitempty"`
}

func InitRabbitMQ() {
	host := getEnv("RABBITMQ_HOST", "localhost")
	port := getEnv("RABBITMQ_PORT", "5672")
	user := getEnv("RABBITMQ_USER", "guest")
	password := getEnv("RABBITMQ_PASSWORD", "guest")

	url := fmt.Sprintf("amqp://%s:%s@%s:%s/", user, password, host, port)

	var err error
	RabbitMQConn, err = amqp.Dial(url)
	if err != nil {
		log.Fatalf("Failed to connect to RabbitMQ: %v", err)
	}

	RabbitMQChan, err = RabbitMQConn.Channel()
	if err != nil {
		log.Fatalf("Failed to open a channel: %v", err)
	}

	err = RabbitMQChan.ExchangeDeclare(
		ChatExchange,
		"fanout",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		log.Fatalf("Failed to declare an exchange: %v", err)
	}

	q, err := RabbitMQChan.QueueDeclare(
		ChatQueue,
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		log.Fatalf("Failed to declare a queue: %v", err)
	}

	err = RabbitMQChan.QueueBind(
		q.Name,
		"",
		ChatExchange,
		false,
		nil,
	)
	if err != nil {
		log.Fatalf("Failed to bind a queue: %v", err)
	}

	log.Println("RabbitMQ connected successfully")
}

func PublishMessage(message MessageEvent) error {
	body, err := json.Marshal(message)
	if err != nil {
		return err
	}

	err = RabbitMQChan.Publish(
		ChatExchange,
		"",
		false,
		false,
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		},
	)
	if err != nil {
		return err
	}

	return nil
}

func ConsumeMessages(handler func(MessageEvent)) error {
	messages, err := RabbitMQChan.Consume(
		ChatQueue,
		"",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	go func() {
		for msg := range messages {
			var messageEvent MessageEvent
			if err := json.Unmarshal(msg.Body, &messageEvent); err != nil {
				log.Printf("Error parsing message: %v", err)
				continue
			}
			handler(messageEvent)
		}
	}()

	return nil
}

func CloseRabbitMQ() {
	if RabbitMQChan != nil {
		RabbitMQChan.Close()
	}
	if RabbitMQConn != nil {
		RabbitMQConn.Close()
	}
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
