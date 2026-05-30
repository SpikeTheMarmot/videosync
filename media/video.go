package media

import "time"

type Video struct {
	Id          string        `json:"id"`
	Title       string        `json:"title"`
	Duration    time.Duration `json:"duration"`
	Thumbnail   string        `json:"thumbnail"`
	Channel     string        `json:"channel"`
	PublishedAt string        `json:"publishedAt"`
	Views       uint64        `json:"views"`
	QueuedBy    string        `json:"queuedBy"`
}
