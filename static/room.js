let player;
/** @type WebSocket */
let ws;
let serverState = { state: null, position: null };
let syncing = false;
let roomId;
/** @type HTMLElement */
let userlist;

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("video_url_input");
    const button = document.getElementById("play_video_button");
    const usernameInput = document.getElementById("username_input");
    const usernameButton = document.getElementById("submit_username_button");
    const usernameModal = document.getElementById("username_modal");
    userlist = document.getElementById("userlist");

    if (
        !(input instanceof HTMLInputElement) ||
        !(button instanceof HTMLButtonElement) ||
        !(usernameInput instanceof HTMLInputElement) ||
        !(usernameButton instanceof HTMLButtonElement) ||
        !(usernameModal instanceof HTMLElement)
    ) {
        return;
    }

    input.addEventListener("keypress", (event) => {
        if (event.code === "Enter") {
            playVideo(input.value);
        }
    });

    button.addEventListener("click", () => {
        playVideo(input.value);
    });

    const cachedUsername = localStorage.getItem("username");
    if (cachedUsername) {
        usernameModal.style.display = "none";
        initRoom(cachedUsername);
        return;
    }

    const submitUsername = (userName) => {
        const username = usernameInput.value.trim();
        if (username === "") {
            return;
        }

        localStorage.setItem("username", username);
        usernameModal.style.display = "none";
        initRoom(username);
    };

    usernameButton.addEventListener("click", () => {
        submitUsername(usernameInput.value);
    });

    usernameInput.addEventListener("keypress", (event) => {
        if (event.code === "Enter") {
            submitUsername(usernameInput.value);
        }
    });
});

function playVideo(url) {
    ws.send(
        JSON.stringify({
            type: "loadurl",
            payload: {
                url,
            },
        })
    );
}

function createPlayer(events) {
    return new Promise((resolve) => {
        const player = new YT.Player("yt_player", {
            width: 1280,
            height: 720,
            events: {},
            events: {
                ...events,
                onReady: () => {
                    resolve(player);
                },
            },
        });
    });
}

function connectSocket(roomId) {
    const ws = new WebSocket(`ws://${document.location.host}/socket/${roomId}`);
    return ws;
}

function updatePlayerState(newState) {
    serverState = { ...newState };

    syncing = true;
    setTimeout(() => {
        syncing = false;
    }, 250);

    switch (newState.state) {
        case YT.PlayerState.PLAYING:
            player.playVideo();
            break;
        case YT.PlayerState.PAUSED:
            player.pauseVideo();
            break;
    }

    player.seekTo(newState.position);
}

async function initRoom(userName) {
    await youtubeApiPromise;
    player = await createPlayer({
        onStateChange: (event) => {
            if (syncing) {
                return;
            }

            switch (event.data) {
                case YT.PlayerState.PLAYING:
                    if (serverState.state !== YT.PlayerState.PLAYING) {
                        serverState.state = YT.PlayerState.PLAYING;
                        serverState.position = player.getCurrentTime();
                        ws.send(
                            JSON.stringify({
                                type: "play",
                                payload: {
                                    position: player.getCurrentTime(),
                                },
                            })
                        );
                    }
                    break;
                case YT.PlayerState.PAUSED:
                    if (serverState.state !== YT.PlayerState.PAUSED) {
                        console.log(
                            `Sending pause because serverState.state is ${serverState.state}`
                        );
                        serverState.state = YT.PlayerState.PAUSED;
                        serverState.position = player.getCurrentTime();
                        ws.send(
                            JSON.stringify({
                                type: "pause",
                                payload: {
                                    position: player.getCurrentTime(),
                                },
                            })
                        );
                    }
                    break;
            }
        },
    });

    player.addEventListener("onPlaying", () => {
        console.log("playing");
    });

    ws = connectSocket(roomId);

    ws.addEventListener("open", () => {
        ws.send(
            JSON.stringify({
                type: "introduce",
                payload: {
                    username: userName,
                },
            })
        );
    });

    ws.addEventListener("message", (event) => {
        const { type, payload } = JSON.parse(event.data);
        switch (type) {
            case "init":
                player.loadVideoById(payload.videoId, payload.videoPos);
                if (payload.playbackState == YT.PlayerState.PAUSED) {
                    player.pauseVideo();
                }
                serverState = {
                    state: payload.playbackState,
                    position: payload.videoPos,
                };
                initUserlist(payload.users);
                break;
            case "play":
                updatePlayerState({
                    state: YT.PlayerState.PLAYING,
                    position: payload.position,
                });
                break;
            case "pause":
                updatePlayerState({
                    state: YT.PlayerState.PAUSED,
                    position: payload.position,
                });
                break;
            case "load":
                player.loadVideoById(payload.videoId, 0);
                updatePlayerState({
                    state: YT.PlayerState.PAUSED,
                    position: 0,
                });
                break;
            case "join":
                addUserNode(payload.userName);
                break;
            case "leave":
                removeUserNode(payload.userName);
                break;
        }
    });

    setInterval(() => {
        if (syncing) {
            return;
        }

        const state = player.getPlayerState();
        if (state === YT.PlayerState.PAUSED) {
            const currentTime = player.getCurrentTime();
            if (
                serverState.position !== null &&
                currentTime !== serverState.position
            ) {
                serverState.position = currentTime;
                ws.send(
                    JSON.stringify({
                        type: "pause",
                        payload: {
                            position: currentTime,
                        },
                    })
                );
            }
            prevTime = currentTime;
        } else {
            prevTime = -1;
        }
    }, 500);
}

function addUserNode(userName) {
    const el = document.createElement("div");
    el.innerText = userName;
    el.classList.add("userlist_item");
    userlist.appendChild(el);
}

function removeUserNode(userName) {
    for (const el of userlist.children) {
        if (el.innerText === userName) {
            userlist.removeChild(el);
            break;
        }
    }
}

function initUserlist(users) {
    userlist.innerHTML = "";

    for (const user of users) {
        addUserNode(user);
    }
}
