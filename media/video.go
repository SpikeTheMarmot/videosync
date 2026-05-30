package media

import "time"

type Video struct {
	Id          string        `json:"id"`
	Title       string        `json:"title"`
	Duration    time.Duration `json:"duration"`
	Position    float32       `json:"position"`
	Thumbnail   string        `json:"thumbnail"`
	Channel     string        `json:"channel"`
	PublishedAt string        `json:"publishedAt"`
	QueuedBy    string        `json:"queuedBy"`
}
