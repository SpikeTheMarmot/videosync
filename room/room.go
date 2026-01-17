package room

import (
	"sync"
	"time"
	"videosync/media"
	"videosync/message"
	"videosync/youtube"
)

type Room struct {
	Id       string
	users    []*User
	mu       sync.Mutex
	playback Playback
	stopSync chan bool
	queue    []media.Video
}

func NewRoom(id string) *Room {
	return &Room{
		Id:       id,
		users:    make([]*User, 0, 2),
		stopSync: make(chan bool),
		queue:    make([]media.Video, 0),
	}
}

func (room *Room) SyncState() {
	ticker := time.NewTicker(time.Second)

	for {
		select {
		case <-ticker.C:
			room.Lock()
			if room.playback.Position() > float32(room.playback.Video.Duration.Seconds()) {
				room.LoadNext()
			}
			room.Unlock()
		case <-room.stopSync:
			return
		}
	}
}

func (room *Room) Close() {
	room.stopSync <- true
}

func (room *Room) Join(user *User) {
	room.users = append(room.users, user)
	users := make([]string, len(room.users))

	for i, user := range room.users {
		users[i] = user.Name
	}

	user.Conn.WriteJSON(message.Message{
		Type: message.Init,
		Payload: message.InitMessage{
			VideoId:       room.playback.Video.Id,
			VideoPos:      room.playback.Position(),
			PlaybackState: int(room.playback.State),
			Users:         users,
			Queue:         room.queue,
		},
	})
	room.Send(user, message.Message{
		Type:    message.Join,
		Payload: message.JoinMessage{UserName: user.Name},
	})
}

func (room *Room) Leave(user *User) {
	for i := range len(room.users) {
		if room.users[i] == user {
			room.users[i] = room.users[len(room.users)-1]
			room.users = room.users[:len(room.users)-1]
			break
		}
	}
	if len(room.users) == 0 {
		room.Close()
	}
	room.Send(user, message.Message{
		Type:    message.Leave,
		Payload: message.LeaveMessage{UserName: user.Name},
	})
}

func (room *Room) Play(user *User, position float32) {
	room.playback.LatestPosition = position
	room.playback.LatestPositionTime = time.Now()
	room.playback.State = Playing
	room.Send(user, message.Message{Type: message.Play, Payload: message.PlayMessage{Position: position}})
}

func (room *Room) Pause(user *User, position float32) {
	room.playback.LatestPosition = position
	room.playback.LatestPositionTime = time.Now()
	room.playback.State = Paused
	room.Send(user, message.Message{Type: message.Pause, Payload: message.PauseMessage{Position: position}})
}

func (room *Room) Load(video media.Video) {
	room.playback.Video = video
	room.playback.LatestPosition = 0
	room.playback.LatestPositionTime = time.Now()
	room.playback.State = Paused

	room.Send(nil, message.Message{Type: message.Load, Payload: message.LoadMessage{VideoId: video.Id}})
}

func (room *Room) AddToQueue(videoId string) {
	video, err := youtube.FetchVideoInfo(videoId)
	if err != nil {
		return
	}
	room.queue = append(room.queue, video)
	if room.playback.Video.Id == "" {
		room.LoadNext()
	} else {
		room.Send(nil, message.Message{Type: message.SyncQueue, Payload: message.SyncQueueMessage{Queue: room.queue}})
	}
}

func (room *Room) LoadNext() {
	if len(room.queue) == 0 {
		if room.playback.Video.Id != "" {
			room.playback = Playback{}
			room.Send(nil, message.Message{Type: message.Load, Payload: message.LoadMessage{VideoId: ""}})
		}
		return
	}
	video := room.queue[0]
	room.queue = room.queue[1:]
	room.Send(nil, message.Message{Type: message.SyncQueue, Payload: message.SyncQueueMessage{Queue: room.queue}})
	room.Load(video)
	time.Sleep(time.Second)
	room.Play(nil, 0)
}

func (room *Room) Kick(user *User) {
	user.Conn.Close()
}

func (room *Room) Send(from *User, message message.Message) {
	for _, user := range room.users {
		if user != from {
			user.Conn.WriteJSON(message)
		}
	}
}

func (room *Room) ReorderQueue(from, to int) {
	if from < 0 || from >= len(room.queue) || to < 0 || to > len(room.queue) || from == to {
		return
	}

	item := room.queue[from]
	room.queue = append(room.queue[:from], room.queue[from+1:]...)

	if to >= len(room.queue) {
		room.queue = append(room.queue, item)
	} else {
		room.queue = append(room.queue[:to], append([]media.Video{item}, room.queue[to:]...)...)
	}

	room.Send(nil, message.Message{Type: message.SyncQueue, Payload: message.SyncQueueMessage{Queue: room.queue}})
}

func (room *Room) RemoveFromQueue(index int) {
	if index < 0 || index >= len(room.queue) {
		return
	}
	room.queue = append(room.queue[:index], room.queue[index+1:]...)
	room.Send(nil, message.Message{Type: message.SyncQueue, Payload: message.SyncQueueMessage{Queue: room.queue}})
}

func (room *Room) Lock() {
	room.mu.Lock()
}

func (room *Room) Unlock() {
	room.mu.Unlock()
}
