package main

import (
	"log"
	"net/http"
	"sync/atomic"
	msg "videosync/message"
	rooms "videosync/room"
	"videosync/youtube"
)

var nextClientId atomic.Int32

func handleRoomSocket(w http.ResponseWriter, r *http.Request) {
	clientId := nextClientId.Add(1)
	room := roomManager.Get(r.PathValue("room_id"))
	var user *rooms.User
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	defer func() {
		if user != nil {
			room.Leave(user)
		}
		conn.Close()
	}()

	user = &rooms.User{Id: int(clientId), Conn: conn}

	var message msg.Message
	err = conn.ReadJSON(&message)
	if err != nil {
		log.Printf("Read error: %v", err)
		return
	}
	if payload, ok := message.Payload.(msg.IntroduceMessage); ok {
		user.Name = payload.UserName
		if len(user.Name) > 25 {
			user.Name = user.Name[:25]
		}
	} else {
		conn.Close()
		return
	}

	room.Join(user)

	for {
		var message msg.Message
		err := conn.ReadJSON(&message)
		if err != nil {
			log.Printf("Read error: %v", err)
			return
		}
		room.Lock()
		switch payload := message.Payload.(type) {
		case msg.PlayMessage:
			room.Play(user, payload.Position)
		case msg.PauseMessage:
			room.Pause(user, payload.Position)
		case msg.QueueUrlMessage:
			if videoId, ok := youtube.ParseUrl(payload.Url); ok {
				room.AddToQueue(user, videoId)
			}
		case msg.ReorderQueueMessage:
			room.ReorderQueue(payload.From, payload.To, *user)
		case msg.RemoveFromQueueMessage:
			room.RemoveFromQueue(payload.Index, *user)
		case msg.SkipVideoMessage:
			room.LoadNext()
		default:
			room.Kick(user)
		}
		room.Unlock()
	}
}
