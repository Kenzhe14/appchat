package services

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Client struct {
	ID         uint
	Username   string
	Conn       *websocket.Conn
	Send       chan []byte
	RoomID     uint
	LastActive time.Time
}

type WebSocketManager struct {
	Clients    map[*Client]bool
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	RoomMap    map[uint]map[*Client]bool
	// Map to track clients by user ID and room ID
	UserRoomMap map[string]*Client
	mu          sync.Mutex
}

func NewWebSocketManager() *WebSocketManager {
	return &WebSocketManager{
		Clients:     make(map[*Client]bool),
		Broadcast:   make(chan []byte),
		Register:    make(chan *Client),
		Unregister:  make(chan *Client),
		RoomMap:     make(map[uint]map[*Client]bool),
		UserRoomMap: make(map[string]*Client),
	}
}

// Get a unique key for a user ID and room ID combination
func getUserRoomKey(userID uint, roomID uint) string {
	return fmt.Sprintf("%d-%d", userID, roomID)
}

func (manager *WebSocketManager) AddClientToRoom(client *Client, roomID uint) {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	// Check if there's already a connection for this user in this room
	userRoomKey := getUserRoomKey(client.ID, roomID)
	existingClient := manager.UserRoomMap[userRoomKey]

	if existingClient != nil && existingClient != client {
		log.Printf("Found existing connection for user %d in room %d, removing it", client.ID, roomID)
		// Close the existing connection
		close(existingClient.Send)
		delete(manager.Clients, existingClient)

		// Remove from room map
		if _, ok := manager.RoomMap[roomID]; ok {
			delete(manager.RoomMap[roomID], existingClient)
		}

		// Don't delete from UserRoomMap yet as we'll replace it
	}

	// Add the client to the room map
	if _, ok := manager.RoomMap[roomID]; !ok {
		manager.RoomMap[roomID] = make(map[*Client]bool)
	}

	manager.RoomMap[roomID][client] = true
	client.RoomID = roomID

	// Store in the user-room map
	manager.UserRoomMap[userRoomKey] = client

	log.Printf("Client added to room %d: %s (ID: %d)", roomID, client.Username, client.ID)
}

func (manager *WebSocketManager) RemoveClientFromRoom(client *Client) {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	// Remove from user-room map
	userRoomKey := getUserRoomKey(client.ID, client.RoomID)
	if existingClient := manager.UserRoomMap[userRoomKey]; existingClient == client {
		delete(manager.UserRoomMap, userRoomKey)
	}

	// Remove from room map
	if _, ok := manager.RoomMap[client.RoomID]; ok {
		delete(manager.RoomMap[client.RoomID], client)
		if len(manager.RoomMap[client.RoomID]) == 0 {
			delete(manager.RoomMap, client.RoomID)
		}
	}

	log.Printf("Client removed from room %d: %s (ID: %d)", client.RoomID, client.Username, client.ID)
}

func (manager *WebSocketManager) BroadcastToRoom(roomID uint, message []byte) {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	if clients, ok := manager.RoomMap[roomID]; ok {
		for client := range clients {
			select {
			case client.Send <- message:
			default:
				close(client.Send)
				delete(manager.Clients, client)
				delete(manager.RoomMap[roomID], client)

				// Also remove from user-room map
				userRoomKey := getUserRoomKey(client.ID, client.RoomID)
				if existingClient := manager.UserRoomMap[userRoomKey]; existingClient == client {
					delete(manager.UserRoomMap, userRoomKey)
				}
			}
		}
	}
}

func (manager *WebSocketManager) Start() {
	for {
		select {
		case client := <-manager.Register:
			manager.Clients[client] = true
			log.Printf("Client registered: %s (ID: %d)", client.Username, client.ID)

		case client := <-manager.Unregister:
			if _, ok := manager.Clients[client]; ok {
				delete(manager.Clients, client)
				close(client.Send)
				manager.RemoveClientFromRoom(client)
				log.Printf("Client unregistered: %s (ID: %d)", client.Username, client.ID)
			}

		case message := <-manager.Broadcast:
			for client := range manager.Clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(manager.Clients, client)
					manager.RemoveClientFromRoom(client)
				}
			}
		}
	}
}

func (client *Client) HandleClient(manager *WebSocketManager) {
	defer func() {
		manager.Unregister <- client
		client.Conn.Close()
	}()
	go func() {
		for {
			_, message, err := client.Conn.ReadMessage()
			if err != nil {
				log.Printf("Error reading message: %v", err)
				break
			}
			client.LastActive = time.Now()
			manager.BroadcastToRoom(client.RoomID, message)
		}
	}()

	for {
		message, ok := <-client.Send
		if !ok {
			client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
			return
		}
		err := client.Conn.WriteMessage(websocket.TextMessage, message)
		if err != nil {
			log.Printf("Error writing message: %v", err)
			return
		}
	}
}
