package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Kenzhe14/chat/api"
	"github.com/Kenzhe14/chat/db"
	"github.com/Kenzhe14/chat/services"

	"github.com/gin-gonic/gin"
)

func main() {
	db.ConnectDatabase()

	services.InitRabbitMQ()
	defer services.CloseRabbitMQ()

	wsManager := services.NewWebSocketManager()
	go wsManager.Start()

	services.ConsumeMessages(func(msg services.MessageEvent) {
		log.Printf("Received message: %s from %s in room %d", msg.Content, msg.Username, msg.RoomID)
	})

	gin.SetMode(gin.DebugMode)
	r := gin.Default()

	r.Use(api.CORSMiddleware())

	authRoutes := r.Group("/api/auth")
	{
		authRoutes.POST("/register", api.RegisterUser)
		authRoutes.POST("/login", api.LoginUser)
	}

	apiRoutes := r.Group("/api")
	{
		authorized := apiRoutes.Group("/")
		authorized.Use(api.AuthMiddleware())
		{
			authorized.POST("/auth/logout", api.LogoutUser)

			roomRoutes := authorized.Group("/rooms")
			{
				roomRoutes.GET("", api.GetRooms)
				roomRoutes.GET("/user", api.GetUserRooms)
				roomRoutes.GET("/:id", api.GetRoom)
				roomRoutes.POST("", api.CreateRoom)
				roomRoutes.PUT("/:id", api.UpdateRoom)
				roomRoutes.DELETE("/:id", api.DeleteRoom)

				roomRoutes.GET("/:id/members", api.GetRoomMembers)
				roomRoutes.POST("/:id/members", api.AddRoomMember)
				roomRoutes.DELETE("/:id/members/:user_id", api.RemoveRoomMember)
			}

			msgRoutes := authorized.Group("/messages")
			{
				msgRoutes.GET("/room/:room_id", api.GetMessages)
				msgRoutes.POST("", api.CreateMessage)
			}
		}

		// WebSocket route with its own auth middleware
		wsRoute := apiRoutes.Group("/ws")
		wsRoute.Use(api.WebSocketAuthMiddleware())
		{
			wsRoute.GET("", api.HandleWebSocket(wsManager))
		}
	}

	routes := r.Routes()
	for _, route := range routes {
		fmt.Printf("Method: %s, Path: %s\n", route.Method, route.Path)
	}

	srv := &http.Server{
		Addr:    ":8080",
		Handler: r,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exiting")
}
