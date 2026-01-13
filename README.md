# Videosync (working title)

This is a web service that lets you synchronize video playback with other users.

The goal of this project is to provide a service that is both simple to set up and use, while providing a very stable and accurate video synchronization. It also has very low hardware requirements for the server.

- No ads
- No chat
- No login
- No permission system
- Native player controls
- Very little playback desync

## Supported platforms

So far, only YouTube is supported. I want to make sure that YouTube works _really_ well before I add any other platforms.

## Roadmap

- Video queue
- Automatic reconnect
- Persisting rooms between restarts
- More server configuration options (e.g. ports)
- Support for a few more platforms

## Server setup

1. Build the project with `go build .`
2. Acquire a YouTube Data API key. There are two methods to pass it to Videosync:
    1. Set an environment variable named `YOUTUBE_API_KEY`
    2. **OR** or create a ".env" file with the content `YOUTUBE_API_KEY=your_key_here` in the same directory as the executable
3. Start the service with `./videosync` (Linux) or `.\videosync.exe` (Windows)
