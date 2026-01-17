package message

import (
	"encoding/json"
	"fmt"
	"videosync/media"
)

type MessageType string

const (
	Init         MessageType = "init"
	Play         MessageType = "play"
	Pause        MessageType = "pause"
	Load         MessageType = "load"
	QueueUrl     MessageType = "queueurl"
	Introduce    MessageType = "introduce"
	Join         MessageType = "join"
	Leave        MessageType = "leave"
	SyncQueue    MessageType = "syncqueue"
	SkipVideo    MessageType = "skip"
	ReorderQueue MessageType = "reorderqueue"
)

type Message struct {
	Type    MessageType `json:"type"`
	Payload any         `json:"payload"`
}

type InitMessage struct {
	VideoId       string        `json:"videoId"`
	VideoPos      float32       `json:"videoPos"`
	PlaybackState int           `json:"playbackState"`
	Users         []string      `json:"users"`
	Queue         []media.Video `json:"queue"`
}

type PlayMessage struct {
	Position float32 `json:"position"`
}

type PauseMessage struct {
	Position float32 `json:"position"`
}

type LoadMessage struct {
	VideoId string `json:"videoId"`
}

type QueueUrlMessage struct {
	Url string `json:"url"`
}

type IntroduceMessage struct {
	UserName string `json:"userName"`
}

type JoinMessage struct {
	UserName string `json:"userName"`
}

type LeaveMessage struct {
	UserName string `json:"userName"`
}

type SyncQueueMessage struct {
	Queue []media.Video `json:"queue"`
}

type SkipVideoMessage struct{}

type ReorderQueueMessage struct {
	From int `json:"from"`
	To   int `json:"to"`
}

func (m *Message) UnmarshalJSON(data []byte) error {
	var temp struct {
		Type    MessageType     `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}

	if err := json.Unmarshal(data, &temp); err != nil {
		return err
	}

	m.Type = temp.Type

	switch temp.Type {
	case Play:
		var payload PlayMessage
		if err := json.Unmarshal(temp.Payload, &payload); err != nil {
			return err
		}
		m.Payload = payload
	case Pause:
		var payload PauseMessage
		if err := json.Unmarshal(temp.Payload, &payload); err != nil {
			return err
		}
		m.Payload = payload
	case Load:
		var payload LoadMessage
		if err := json.Unmarshal(temp.Payload, &payload); err != nil {
			return err
		}
		m.Payload = payload
	case QueueUrl:
		var payload QueueUrlMessage
		if err := json.Unmarshal(temp.Payload, &payload); err != nil {
			return err
		}
		m.Payload = payload
	case Introduce:
		var payload IntroduceMessage
		if err := json.Unmarshal(temp.Payload, &payload); err != nil {
			return err
		}
		m.Payload = payload
	case SyncQueue:
		var payload SyncQueueMessage
		if err := json.Unmarshal(temp.Payload, &payload); err != nil {
			return err
		}
		m.Payload = payload
	case SkipVideo:
		m.Payload = SkipVideoMessage{}
	case ReorderQueue:
		var payload ReorderQueueMessage
		if err := json.Unmarshal(temp.Payload, &payload); err != nil {
			return err
		}
		m.Payload = payload
	default:
		return fmt.Errorf("unknown message type: %s", temp.Type)
	}

	return nil
}
