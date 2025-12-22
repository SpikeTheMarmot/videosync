package main

import (
	"embed"
	"flag"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"videosync/internal"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
)

//go:embed static
var staticFiles embed.FS

//go:embed templates
var templatesFiles embed.FS

var isDev = flag.Bool("dev", false, "use static files from filesystem")

const listenAddress = "0.0.0.0:8080"

var upgrader = websocket.Upgrader{}

var rooms *internal.RoomManager = internal.NewRoomManager()

func loadTemplate(name string) (*template.Template, error) {
	var content []byte
	var err error
	if *isDev {
		content, err = os.ReadFile("templates/" + name)
	} else {
		content, err = templatesFiles.ReadFile("templates/" + name)
	}
	if err != nil {
		return nil, err
	}
	t, err := template.New(name).Parse(string(content))
	if err != nil {
		return nil, err
	}
	return t, nil
}

func renderTemplate(w io.Writer, name string, data any) error {
	t, err := loadTemplate(name)
	if err != nil {
		return err
	}

	return t.Execute(w, data)
}

func main() {
	if _, err := os.Stat(".env"); err == nil {
		err := godotenv.Load()
		if err != nil {
			log.Fatalf("error loading .env file: %v", err)
		}
	}

	if os.Getenv("YOUTUBE_API_KEY") == "" {
		log.Println("environment variable YOUTUBE_API_KEY is not set")
		return
	}

	flag.Parse()
	var staticHandler http.Handler
	if *isDev {
		staticHandler = http.StripPrefix("/static", http.FileServer(http.Dir("./static")))
	} else {
		staticHandler = http.FileServer(http.FS(staticFiles))
	}
	http.HandleFunc("GET /socket/{room_id}", handleRoomSocket)
	http.HandleFunc("GET /room/{room_id}", handleRoom)
	http.Handle("/static/", staticHandler)
	http.HandleFunc("/", handleHome)
	log.Printf("Listening on http://%s\n", listenAddress)
	http.ListenAndServe(listenAddress, nil)
}

func handleHome(w http.ResponseWriter, r *http.Request) {
	err := renderTemplate(w, "index.html", nil)
	if err != nil {
		log.Println(err)
		w.WriteHeader(500)
	}
}

func handleRoom(w http.ResponseWriter, r *http.Request) {
	room := rooms.Get(r.PathValue("room_id"))
	err := renderTemplate(w, "room.html", room)
	if err != nil {
		log.Println(err)
		w.WriteHeader(500)
	}
}
