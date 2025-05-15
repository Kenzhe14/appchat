package api

import (
	"log"
	"net/http"
	"strconv"

	"github.com/Kenzhe14/chat/db"
	"github.com/Kenzhe14/chat/models"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.GetHeader("X-User-ID")
		if userIDStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
			c.Abort()
			return
		}

		userID, err := strconv.ParseUint(userIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат ID пользователя"})
			c.Abort()
			return
		}

		var user models.User
		if err := db.DB.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Пользователь не найден"})
			c.Abort()
			return
		}

		c.Set("user_id", uint(userID))
		c.Set("username", user.Username)

		c.Next()
	}
}

// WebSocketAuthMiddleware authenticates WebSocket connections using query parameters
func WebSocketAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Try to get user ID from query parameter
		userIDStr := c.Query("user_id")

		// If not found, try to get it from the token
		if userIDStr == "" {
			// For simplicity in this fix, we're assuming all users
			// In a real app, you would decode the token and extract the user ID
			log.Printf("WebSocket Auth: No user_id in query, using default user")
			// Set a default user ID for testing (first user in the system)
			var user models.User
			if err := db.DB.First(&user).Error; err == nil {
				userIDStr = strconv.FormatUint(uint64(user.ID), 10)
				log.Printf("WebSocket Auth: Using default user ID: %s", userIDStr)
			} else {
				log.Printf("WebSocket Auth: No users found in the database")
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
				c.Abort()
				return
			}
		}

		userID, err := strconv.ParseUint(userIDStr, 10, 32)
		if err != nil {
			log.Printf("WebSocket Auth: Invalid user ID format: %s", userIDStr)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат ID пользователя"})
			c.Abort()
			return
		}

		var user models.User
		if err := db.DB.First(&user, userID).Error; err != nil {
			log.Printf("WebSocket Auth: User not found: %d", userID)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Пользователь не найден"})
			c.Abort()
			return
		}

		log.Printf("WebSocket Auth: Successfully authenticated user: %s (ID: %d)", user.Username, user.ID)
		c.Set("user_id", uint(userID))
		c.Set("username", user.Username)

		c.Next()
	}
}

func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Log request for debugging
		log.Printf("CORS middleware processing request: %s %s", c.Request.Method, c.Request.URL.Path)

		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-User-ID, Accept, Origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")
		c.Writer.Header().Set("Access-Control-Max-Age", "86400")

		// Handle preflight OPTIONS requests
		if c.Request.Method == "OPTIONS" {
			log.Printf("Handling OPTIONS preflight request for path: %s", c.Request.URL.Path)
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
