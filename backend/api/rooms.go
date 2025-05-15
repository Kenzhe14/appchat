package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Kenzhe14/chat/db"
	"github.com/Kenzhe14/chat/models"

	"github.com/gin-gonic/gin"
)

type CreateRoomRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	IsPrivate   bool   `json:"is_private"`
}

type AddMemberRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type RoomMemberResponse struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Status   string `json:"status"`
	JoinedAt string `json:"joined_at"`
}

func GetRooms(c *gin.Context) {
	var rooms []models.Room
	result := db.DB.Find(&rooms)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении комнат"})
		return
	}

	c.JSON(http.StatusOK, rooms)
}

func GetRoom(c *gin.Context) {
	roomID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID комнаты"})
		return
	}

	var room models.Room
	if err := db.DB.Preload("Owner").First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Комната не найдена"})
		return
	}

	c.JSON(http.StatusOK, room)
}

func CreateRoom(c *gin.Context) {
	var req CreateRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}

	room := models.Room{
		Name:        req.Name,
		Description: req.Description,
		IsPrivate:   req.IsPrivate,
		OwnerID:     userID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := db.DB.Create(&room).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при создании комнаты: " + err.Error()})
		return
	}

	roomMember := models.RoomMember{
		RoomID:    room.ID,
		UserID:    userID,
		JoinedAt:  time.Now(),
		InvitedBy: userID,
	}

	if err := db.DB.Create(&roomMember).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при добавлении пользователя в комнату: " + err.Error()})
		return
	}

	var owner models.User
	if err := db.DB.First(&owner, userID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении информации о владельце: " + err.Error()})
		return
	}
	room.Owner = owner

	c.JSON(http.StatusCreated, room)
}

func UpdateRoom(c *gin.Context) {
	roomID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID комнаты"})
		return
	}

	var req CreateRoomRequest
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
	if err := db.DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Комната не найдена"})
		return
	}

	if room.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Вы не являетесь владельцем этой комнаты"})
		return
	}

	room.Name = req.Name
	room.Description = req.Description
	room.IsPrivate = req.IsPrivate
	room.UpdatedAt = time.Now()

	if err := db.DB.Save(&room).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при обновлении комнаты"})
		return
	}

	c.JSON(http.StatusOK, room)
}

func DeleteRoom(c *gin.Context) {
	roomID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID комнаты"})
		return
	}

	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}

	var room models.Room
	if err := db.DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Комната не найдена"})
		return
	}

	if room.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Вы не являетесь владельцем этой комнаты"})
		return
	}

	if err := db.DB.Delete(&room).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при удалении комнаты"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Комната успешно удалена"})
}

func GetRoomMembers(c *gin.Context) {
	roomID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID комнаты"})
		return
	}

	var room models.Room
	if err := db.DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Комната не найдена"})
		return
	}

	userID := c.GetUint("user_id")
	if room.IsPrivate {
		var member models.RoomMember
		if err := db.DB.Where("room_id = ? AND user_id = ?", roomID, userID).First(&member).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "У вас нет доступа к этой комнате"})
			return
		}
	}

	var members []struct {
		UserID    uint
		JoinedAt  time.Time
		InvitedBy uint
		Username  string
		Email     string
		Status    string
	}

	query := `
		SELECT rm.user_id, rm.joined_at, rm.invited_by, u.username, u.email, u.status 
		FROM room_members rm 
		JOIN users u ON rm.user_id = u.id 
		WHERE rm.room_id = ?
	`
	if err := db.DB.Raw(query, roomID).Scan(&members).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении участников комнаты"})
		return
	}

	var response []RoomMemberResponse
	for _, m := range members {
		response = append(response, RoomMemberResponse{
			ID:       m.UserID,
			Username: m.Username,
			Email:    m.Email,
			Status:   m.Status,
			JoinedAt: m.JoinedAt.Format(time.RFC3339),
		})
	}

	c.JSON(http.StatusOK, response)
}

func AddRoomMember(c *gin.Context) {
	roomID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID комнаты"})
		return
	}

	var req AddMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var room models.Room
	if err := db.DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Комната не найдена"})
		return
	}

	inviterID := c.GetUint("user_id")

	if room.IsPrivate && room.OwnerID != inviterID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Только владелец может добавлять участников в приватную комнату"})
		return
	}

	var inviterMembership models.RoomMember
	if err := db.DB.Where("room_id = ? AND user_id = ?", roomID, inviterID).First(&inviterMembership).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Вы не являетесь участником этой комнаты"})
		return
	}

	var user models.User
	if err := db.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь с указанным email не найден"})
		return
	}

	var existingMember models.RoomMember
	result := db.DB.Where("room_id = ? AND user_id = ?", roomID, user.ID).First(&existingMember)
	if result.Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Пользователь уже является участником комнаты"})
		return
	}
	member := models.RoomMember{
		RoomID:    uint(roomID),
		UserID:    user.ID,
		JoinedAt:  time.Now(),
		InvitedBy: inviterID,
	}

	if err := db.DB.Create(&member).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при добавлении пользователя в комнату"})
		return
	}

	response := RoomMemberResponse{
		ID:       user.ID,
		Username: user.Username,
		Email:    user.Email,
		Status:   user.Status,
		JoinedAt: member.JoinedAt.Format(time.RFC3339),
	}

	c.JSON(http.StatusOK, response)
}

func RemoveRoomMember(c *gin.Context) {
	roomID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID комнаты"})
		return
	}

	userID, err := strconv.ParseUint(c.Param("user_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный ID пользователя"})
		return
	}

	var room models.Room
	if err := db.DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Комната не найдена"})
		return
	}

	removerID := c.GetUint("user_id")

	if room.OwnerID != removerID && uint(userID) != removerID {
		c.JSON(http.StatusForbidden, gin.H{"error": "У вас нет прав на удаление этого участника"})
		return
	}

	if uint(userID) == room.OwnerID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Нельзя удалить владельца комнаты"})
		return
	}

	if err := db.DB.Where("room_id = ? AND user_id = ?", roomID, userID).Delete(&models.RoomMember{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при удалении участника"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Участник успешно удален из комнаты"})
}

func GetUserRooms(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}

	var roomIDs []uint
	if err := db.DB.Model(&models.RoomMember{}).Where("user_id = ?", userID).Pluck("room_id", &roomIDs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении ID комнат: " + err.Error()})
		return
	}

	var ownedRoomIDs []uint
	if err := db.DB.Model(&models.Room{}).Where("owner_id = ?", userID).Pluck("id", &ownedRoomIDs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении ID созданных комнат: " + err.Error()})
		return
	}

	allRoomIDs := make(map[uint]bool)
	for _, id := range roomIDs {
		allRoomIDs[id] = true
	}
	for _, id := range ownedRoomIDs {
		allRoomIDs[id] = true
	}

	uniqueRoomIDs := []uint{}
	for id := range allRoomIDs {
		uniqueRoomIDs = append(uniqueRoomIDs, id)
	}

	if len(uniqueRoomIDs) == 0 {
		c.JSON(http.StatusOK, []models.Room{})
		return
	}

	var rooms []models.Room
	if err := db.DB.Preload("Owner").Where("id IN ?", uniqueRoomIDs).Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении комнат: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, rooms)
}
