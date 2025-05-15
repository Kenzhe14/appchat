package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/Kenzhe14/chat/db"
	"github.com/Kenzhe14/chat/models"
	"github.com/Kenzhe14/chat/services"

	"github.com/gin-gonic/gin"
)

type CreateMessageRequest struct {
	Content string `json:"content" binding:"required"`
	RoomID  uint   `json:"room_id" binding:"required"`
}

func GetMessages(c *gin.Context) {
	roomID, err := strconv.ParseUint(c.Param("room_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID комнаты"})
		return
	}

	var room models.Room
	if err := db.DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Комната не найдена"})
		return
	}

	var messages []models.Message
	result := db.DB.Where("room_id = ?", roomID).
		Order("created_at").
		Preload("User").
		Find(&messages)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении сообщений"})
		return
	}

	c.JSON(http.StatusOK, messages)
}

func CreateMessage(c *gin.Context) {
	var req CreateMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}

	var room models.Room
	if err := db.DB.First(&room, req.RoomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Комната не найдена"})
		return
	}

	var user models.User
	if err := db.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Пользователь не найден"})
		return
	}

	message := models.Message{
		Content:   req.Content,
		UserID:    userID,
		RoomID:    req.RoomID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := db.DB.Create(&message).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при создании сообщения"})
		return
	}

	db.DB.Model(&message).Association("User").Find(&message.User)

	go func() {
		messageEvent := services.MessageEvent{
			Type:      "new_message",
			RoomID:    req.RoomID,
			UserID:    userID,
			Username:  user.Username,
			Content:   req.Content,
			Timestamp: message.CreatedAt.Format(time.RFC3339),
			Data: map[string]interface{}{
				"message_id": message.ID,
			},
		}

		if err := services.PublishMessage(messageEvent); err != nil {
		}
	}()

	c.JSON(http.StatusCreated, message)
}

func HandleWebSocket(manager *services.WebSocketManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		roomIDStr := c.Query("room_id")
		roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
		if err != nil || roomID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID комнаты"})
			return
		}

		userID := c.GetUint("user_id")
		if userID == 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
			return
		}

		var user models.User
		if err := db.DB.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Пользователь не найден"})
			return
		}

		var room models.Room
		if err := db.DB.First(&room, roomID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Комната не найдена"})
			return
		}

		upgrader := services.NewWebSocketUpgrader()
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось установить WebSocket-соединение"})
			return
		}

		client := &services.Client{
			ID:         userID,
			Username:   user.Username,
			Conn:       conn,
			Send:       make(chan []byte, 256),
			RoomID:     uint(roomID),
			LastActive: time.Now(),
		}

		manager.Register <- client
		manager.AddClientToRoom(client, uint(roomID))

		connectMessage := map[string]interface{}{
			"type":      "user_connected",
			"user_id":   userID,
			"username":  user.Username,
			"room_id":   roomID,
			"timestamp": time.Now().Format(time.RFC3339),
		}
		messageJSON, _ := json.Marshal(connectMessage)
		manager.BroadcastToRoom(uint(roomID), messageJSON)

		go client.HandleClient(manager)
	}
}
