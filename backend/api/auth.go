package api

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/Kenzhe14/chat/db"
	"github.com/Kenzhe14/chat/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type RegisterRequest struct {
	Username string `json:"username" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func RegisterUser(c *gin.Context) {
	// Log registration attempt
	log.Println("Registration attempt received")

	// Debug headers
	for k, v := range c.Request.Header {
		log.Printf("Header: %s = %v", k, v)
	}

	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("Registration binding error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("Processing registration for username: %s, email: %s", req.Username, req.Email)

	var existingUser models.User
	result := db.DB.Where("username = ?", req.Username).First(&existingUser)
	if result.Error == nil {
		log.Printf("Username already exists: %s", req.Username)
		c.JSON(http.StatusConflict, gin.H{"error": "Пользователь с таким именем уже существует"})
		return
	} else if result.Error != gorm.ErrRecordNotFound {
		log.Printf("Database error when checking username: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при проверке пользователя"})
		return
	}

	result = db.DB.Where("email = ?", req.Email).First(&existingUser)
	if result.Error == nil {
		log.Printf("Email already exists: %s", req.Email)
		c.JSON(http.StatusConflict, gin.H{"error": "Пользователь с таким email уже существует"})
		return
	} else if result.Error != gorm.ErrRecordNotFound {
		log.Printf("Database error when checking email: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при проверке email"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("Password hashing error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при хешировании пароля"})
		return
	}

	user := models.User{
		Username:  req.Username,
		Email:     req.Email,
		Password:  string(hashedPassword),
		Status:    "offline",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := db.DB.Create(&user).Error; err != nil {
		log.Printf("User creation error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Ошибка при создании пользователя: %v", err)})
		return
	}

	log.Printf("User registered successfully: %s (ID: %d)", user.Username, user.ID)
	c.JSON(http.StatusCreated, gin.H{
		"id":       user.ID,
		"username": user.Username,
		"email":    user.Email,
		"status":   user.Status,
	})
}

func LoginUser(c *gin.Context) {
	log.Println("Login attempt received")

	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("Login binding error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("Processing login for username: %s", req.Username)

	var user models.User
	if err := db.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		log.Printf("User not found: %s", req.Username)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверное имя пользователя или пароль"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		log.Printf("Invalid password for user: %s", req.Username)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверное имя пользователя или пароль"})
		return
	}

	user.Status = "online"
	db.DB.Save(&user)

	log.Printf("User logged in successfully: %s (ID: %d)", user.Username, user.ID)
	c.JSON(http.StatusOK, gin.H{
		"id":       user.ID,
		"username": user.Username,
		"email":    user.Email,
		"status":   user.Status,
	})
}

func LogoutUser(c *gin.Context) {
	userID := c.GetUint("user_id")
	log.Printf("Logout attempt for user ID: %d", userID)

	var user models.User
	if err := db.DB.First(&user, userID).Error; err == nil {
		user.Status = "offline"
		db.DB.Save(&user)
		log.Printf("User logged out successfully: %s (ID: %d)", user.Username, user.ID)
	} else {
		log.Printf("User not found for logout: %d", userID)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Успешный выход из системы"})
}
