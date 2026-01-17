let player;
/** @type WebSocket */
let ws;
let serverState = { state: null, position: null };
let syncing = false;
let roomId;
/** @type HTMLElement */
let userlist;
/** @type HTMLElement */
let queuewrapper;

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("video_url_input");
    const queueButton = document.getElementById("add_to_queue_button");
    const skipButton = document.getElementById("skip_button");
    const usernameInput = document.getElementById("username_input");
    const usernameButton = document.getElementById("submit_username_button");
    const usernameModal = document.getElementById("username_modal");
    const playerWrapper = document.getElementById("player_wrapper");
    userlist = document.getElementById("userlist");
    queuewrapper = document.getElementById("queuewrapper");

    if (
        !(input instanceof HTMLInputElement) ||
        !(queueButton instanceof HTMLButtonElement) ||
        !(skipButton instanceof HTMLButtonElement) ||
        !(usernameInput instanceof HTMLInputElement) ||
        !(usernameButton instanceof HTMLButtonElement) ||
        !(usernameModal instanceof HTMLElement) ||
        !(playerWrapper instanceof HTMLElement)
    ) {
        return;
    }

    input.addEventListener("keypress", (event) => {
        if (event.code === "Enter") {
            queueVideo(input.value);
            input.value = "";
        }
    });

    queueButton.addEventListener("click", () => {
        queueVideo(input.value);
        input.value = "";
    });

    skipButton.addEventListener("click", () => {
        skipVideo();
    });

    window.addEventListener("resize", () => {
        if (player) {
            const { width, height } = calculatePlayerSize();
            player.setSize(width, height);
        }
    });

    const cachedUsername = localStorage.getItem("username");
    if (cachedUsername) {
        usernameModal.style.display = "none";
        initRoom(cachedUsername);
        return;
    }

    const submitUsername = (userName) => {
        const sanitizedUserName = userName.trim().substring(0, 25);
        if (sanitizedUserName === "") {
            return;
        }

        localStorage.setItem("username", sanitizedUserName);
        usernameModal.style.display = "none";
        initRoom(sanitizedUserName);
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

function queueVideo(url) {
    ws.send(
        JSON.stringify({
            type: "queueurl",
            payload: {
                url,
            },
        })
    );
}

function reorderQueue(from, to) {
    ws.send(JSON.stringify({
        type: "reorderqueue",
        payload: { from, to }
    }));
}

function skipVideo() {
    ws.send(JSON.stringify({
        type: "skip",
    }));
}

function createPlayer(width, height, events) {
    return new Promise((resolve) => {
        const player = new YT.Player("yt_player", {
            width: width,
            height: height,
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
    const proto = document.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${document.location.host}/socket/${roomId}`);
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

/**
 * @return {{width: number; height: number;}}
 */
function calculatePlayerSize() {
    const playerWrapper = document.getElementById("player_wrapper");
    let width = playerWrapper.clientWidth;
    let height = width / (16 / 9);
    if (height > window.innerHeight * 0.75) {
        height = window.innerHeight * 0.75;
        width = height * (16 / 9);
    }
    console.log({ width, height });
    return { width, height };
}

async function initRoom(userName) {
    const { width: playerWidth, height: playerHeight } = calculatePlayerSize();

    await youtubeApiPromise;
    player = await createPlayer(playerWidth, playerHeight, {
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
                    username: userName.trim().substring(0, 25),
                },
            })
        );
    });

    ws.addEventListener("message", (event) => {
        const { type, payload } = JSON.parse(event.data);
        switch (type) {
            case "init":
                if (payload.videoId !== "") {
                    player.loadVideoById(payload.videoId, payload.videoPos);
                }
                if (payload.playbackState == YT.PlayerState.PAUSED) {
                    player.pauseVideo();
                }
                updateQueue(payload.queue);
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
            case "syncqueue":
                updateQueue(payload.queue);
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
            el.remove();
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

function updateQueue(queue) {
    queuewrapper.innerHTML = "";
    if (queue.length === 0) {
        queuewrapper.innerText = "The video queue is empty.";
    }

    for (let i = 0; i < queue.length; i++) {
        const video = queue[i];

        const videoInfo = document.createElement("div");
        const title = document.createElement("span");
        title.classList.add("video_title");
        title.innerText = video.title;
        const duration = document.createElement("span");
        duration.classList.add("video_duration");
        duration.innerText = "(" + formatNanoseconds(video.duration) + ")";
        videoInfo.appendChild(title);
        videoInfo.appendChild(duration);

        const el = document.createElement("div");
        el.classList.add("queue-video");
        el.appendChild(videoInfo);
        addQueueOrderControls(el, queue.length, i);

        queuewrapper.appendChild(el);
    }
}

function addQueueOrderControls(parent, queueLength, i) {
    const controls = document.createElement("span");
    controls.classList.add("queue-controls");

    const toTop = document.createElement("button");
    toTop.innerText = "⇈";
    toTop.title = "Move to top";
    toTop.disabled = (i === 0);
    toTop.addEventListener("click", () => reorderQueue(i, 0));

    const up = document.createElement("button");
    up.innerText = "↑";
    up.title = "Move up";
    up.disabled = (i === 0);
    up.addEventListener("click", () => reorderQueue(i, i - 1));

    const down = document.createElement("button");
    down.innerText = "↓";
    down.title = "Move down";
    down.disabled = (i === queueLength - 1);
    down.addEventListener("click", () => reorderQueue(i, i + 1));

    const toBottom = document.createElement("button");
    toBottom.innerText = "⇊";
    toBottom.title = "Move to bottom";
    toBottom.disabled = (i === queueLength - 1);
    toBottom.addEventListener("click", () => reorderQueue(i, queueLength - 1));

    controls.appendChild(toTop)
    controls.appendChild(up);
    controls.appendChild(down);
    controls.appendChild(toBottom)

    parent.appendChild(controls);
}

function formatNanoseconds(ns) {
    let seconds = ns / 1_000_000_000;
    const hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;
    const minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;

    let str = "";
    if (hours > 0) {
        str += hours.toString().padStart(2, "0") + ":";
    }
    str += minutes.toString().padStart(2, "0") + ":";
    str += seconds.toString().padStart(2, "0");
    return str;
}
