package models

import (
	"time"

	"gorm.io/gorm"
)

type Room struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Name        string         `json:"name" gorm:"not null"`
	Description string         `json:"description"`
	IsPrivate   bool           `json:"is_private" gorm:"default:false"`
	OwnerID     uint           `json:"owner_id"`
	Owner       User           `json:"owner" gorm:"foreignKey:OwnerID"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
	Messages    []Message      `json:"-" gorm:"foreignKey:RoomID"`
	Members     []User         `json:"members" gorm:"many2many:room_members;"`
}

type RoomMember struct {
	RoomID    uint      `gorm:"primaryKey"`
	UserID    uint      `gorm:"primaryKey"`
	JoinedAt  time.Time `json:"joined_at"`
	InvitedBy uint      `json:"invited_by"`
}
