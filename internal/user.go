package internal

import "github.com/gorilla/websocket"

type User struct {
	Id   int
	Name string
	Conn *websocket.Conn
}
