package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"sync/atomic"
	"videosync/internal"
	"videosync/internal/youtube"
)

var nextClientId atomic.Int32

func handleRoomSocket(w http.ResponseWriter, r *http.Request) {
	clientId := nextClientId.Add(1)
	logger := log.New(os.Stdout, fmt.Sprintf("[client #%d] ", clientId), log.LstdFlags)
	logger.Println("Client connected")
	room := rooms.Get(r.PathValue("room_id"))
	var user *internal.User
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Println(err)
		return
	}
	defer func() {
		logger.Println("Client disconnected")
		if user != nil {
			room.Leave(user)
		}
		conn.Close()
	}()

	user = &internal.User{Id: int(clientId), Conn: conn}

	var message internal.Message
	err = conn.ReadJSON(&message)
	if err != nil {
		logger.Printf("Read error: %v", err)
		return
	}
	if payload, ok := message.Payload.(internal.IntroduceMessage); ok {
		user.Name = payload.UserName
	} else {
		conn.Close()
		return
	}

	room.Join(user)

	for {
		var message internal.Message
		err := conn.ReadJSON(&message)
		if err != nil {
			logger.Printf("Read error: %v", err)
			return
		}
		switch payload := message.Payload.(type) {
		case internal.PlayMessage:
			room.Play(user, payload.Position)
		case internal.PauseMessage:
			room.Pause(user, payload.Position)
		case internal.LoadUrlMessage:
			if videoId, ok := youtube.ParseUrl(payload.Url); ok {
				room.Load(user, videoId)
			}
		default:
			room.Kick(user)
		}
	}
}
