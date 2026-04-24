const NO_VIDEO_PLAYING_MESSAGE = "No video is currently playing.";
const roomId = getRoomId();

let player;
/** @type WebSocket */
let ws;
let serverState = { state: null, position: null };
let syncing = false;
/** @type HTMLElement */
let userlist;
/** @type HTMLElement */
let userlistMobile;
/** @type HTMLElement */
let queuewrapper;
/** @type HTMLElement */
let playerWrapper;
/** @type HTMLElement */
let currentVideoInfoPanel;
/** @type HTMLElement */
let currentVideoInfoPanelMobile;

const youtubeApiPromise = new Promise((resolve, _reject) => {
    window.onYouTubePlayerAPIReady = () => {
        resolve();
    };
});

const pageReadyPromise = new Promise((resolve) => {
    if (
        document.readyState === "complete" ||
        document.readyState === "loaded"
    ) {
        resolve();
        return;
    }

    document.addEventListener("DOMContentLoaded", () => {
        resolve();
    });
});

init();

async function init() {
    await pageReadyPromise;

    const main = document.getElementById("main");
    const input = document.getElementById("video_url_input");
    const queueButton = document.getElementById("add_to_queue_button");
    const skipButton = document.getElementById("skip_button");
    const usernameInput = document.getElementById("username_input");
    const usernameButton = document.getElementById("submit_username_button");
    const usernameModal = document.getElementById("username_modal");
    const changeNameButton = document.getElementById("change_name_button");
    const changeNameButtonMobile = document.getElementById(
        "change_name_button_mobile",
    );
    playerWrapper = document.getElementById("player_wrapper");
    userlist = document.getElementById("userlist");
    userlistMobile = document.getElementById("userlist_mobile");
    queuewrapper = document.getElementById("queuewrapper");
    currentVideoInfoPanel = document.getElementById("current_video_info_panel");
    currentVideoInfoPanelMobile = document.getElementById(
        "current_video_info_panel_mobile",
    );

    if (
        !(input instanceof HTMLInputElement) ||
        !(queueButton instanceof HTMLButtonElement) ||
        !(skipButton instanceof HTMLButtonElement) ||
        !(usernameInput instanceof HTMLInputElement) ||
        !(usernameButton instanceof HTMLButtonElement) ||
        !(usernameModal instanceof HTMLElement) ||
        !(playerWrapper instanceof HTMLElement) ||
        !(changeNameButton instanceof HTMLButtonElement) ||
        !(userlist instanceof HTMLElement) ||
        !(queuewrapper instanceof HTMLElement)
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
            if (playerWrapper instanceof HTMLElement) {
                playerWrapper.style.width = width + "px";
                playerWrapper.style.height = height + "px";
            }
            player.setSize(width, height);
        }
    });

    const cachedUsername = localStorage.getItem("username");
    if (cachedUsername) {
        usernameModal.style.display = "none";
        initPlayer(cachedUsername);
    }

    const submitUsername = (userName) => {
        const sanitizedUserName = userName.trim().substring(0, 25);
        if (sanitizedUserName === "") {
            return;
        }

        localStorage.setItem("username", sanitizedUserName);
        usernameModal.style.display = "none";
        initPlayer(sanitizedUserName);
    };

    usernameButton.addEventListener("click", () => {
        submitUsername(usernameInput.value);
    });

    usernameInput.addEventListener("keypress", (event) => {
        if (event.code === "Enter") {
            submitUsername(usernameInput.value);
        }
    });

    changeNameButton.addEventListener("click", () => {
        localStorage.removeItem("username");
        window.location.reload();
    });

    if (changeNameButtonMobile instanceof HTMLButtonElement) {
        changeNameButtonMobile.addEventListener("click", () => {
            localStorage.removeItem("username");
            window.location.reload();
        });
    }
}

async function initPlayer(userName) {
    await youtubeApiPromise;

    const { width: playerWidth, height: playerHeight } = calculatePlayerSize();

    if (playerWrapper instanceof HTMLElement) {
        playerWrapper.style.width = playerWidth + "px";
        playerWrapper.style.height = playerHeight + "px";
    }

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
                            }),
                        );
                    }
                    break;
                case YT.PlayerState.PAUSED:
                    if (serverState.state !== YT.PlayerState.PAUSED) {
                        serverState.state = YT.PlayerState.PAUSED;
                        serverState.position = player.getCurrentTime();
                        ws.send(
                            JSON.stringify({
                                type: "pause",
                                payload: {
                                    position: player.getCurrentTime(),
                                },
                            }),
                        );
                    }
                    break;
            }
        },
    });

    ws = connectSocket(roomId);

    ws.addEventListener("open", () => {
        ws.send(
            JSON.stringify({
                type: "introduce",
                payload: {
                    username: userName.trim().substring(0, 25),
                },
            }),
        );
    });

    ws.addEventListener("message", (event) => {
        const { type, payload } = JSON.parse(event.data);
        switch (type) {
            case "init":
                if (payload.currentVideo.id !== "") {
                    player.loadVideoById(
                        payload.currentVideo.id,
                        payload.videoPos,
                    );
                    updateCurrentVideoInfo(payload.currentVideo);
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
                player.loadVideoById(payload.video.id, 0);
                updatePlayerState({
                    state: YT.PlayerState.PAUSED,
                    position: 0,
                });
                updateCurrentVideoInfo(payload.video);
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
                    }),
                );
            }
        }
    }, 500);
}

function getRoomId() {
    const re = /^\/room\/([a-z0-9-]+)$/;
    const match = location.pathname.match(re);
    if (match === null) {
        throw new Error(`Invalid path ${location.pathname}`);
    }
    return match[1];
}

function queueVideo(url) {
    ws.send(
        JSON.stringify({
            type: "queueurl",
            payload: {
                url,
            },
        }),
    );
}

function reorderQueue(from, to) {
    ws.send(
        JSON.stringify({
            type: "reorderqueue",
            payload: { from, to },
        }),
    );
}

function removeFromQueue(index) {
    ws.send(
        JSON.stringify({
            type: "removefromqueue",
            payload: { index },
        }),
    );
}

function skipVideo() {
    ws.send(
        JSON.stringify({
            type: "skip",
        }),
    );
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

function connectSocket() {
    const proto = document.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
        `${proto}://${document.location.host}/socket/${roomId}`,
    );
    return ws;
}

function updateCurrentVideoInfo(video) {
    if (video.id === "") {
        currentVideoInfoPanel.innerText = NO_VIDEO_PLAYING_MESSAGE;
        currentVideoInfoPanelMobile.innerText = NO_VIDEO_PLAYING_MESSAGE;
        return;
    }
    currentVideoInfoPanel.replaceChildren(createCurrentVideoInfo(video));
    currentVideoInfoPanelMobile.replaceChildren(createCurrentVideoInfo(video));
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
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const spacing = 158;

    let width;
    if (vw < 1360) {
        width = Number.parseFloat(getComputedStyle(main).width);
    } else {
        width = Math.floor(Math.min(vw * 0.75, 1920));
    }

    let height = Math.round(width * (9 / 16));

    const maxAllowedHeight = Math.max(0, vh - spacing);
    if (height > maxAllowedHeight) {
        height = Math.floor(maxAllowedHeight);
        width = Math.floor(height * (16 / 9));
    }

    if (width > vw) {
        width = Math.floor(vw);
        height = Math.floor(width * (9 / 16));
    }

    return { width: Math.floor(width), height: Math.floor(height) };
}

function addUserNode(userName) {
    const el = document.createElement("div");
    el.innerText = userName;
    el.classList.add("userlist_item");
    if (userlist instanceof HTMLElement) {
        userlist.appendChild(el);
    }
    if (userlistMobile instanceof HTMLElement) {
        userlistMobile.appendChild(el.cloneNode(true));
    }
}

function removeUserNode(userName) {
    if (userlist instanceof HTMLElement) {
        for (const el of Array.from(userlist.children)) {
            if (el.innerText === userName) {
                el.remove();
                break;
            }
        }
    }
    if (userlistMobile instanceof HTMLElement) {
        for (const el of Array.from(userlistMobile.children)) {
            if (el.innerText === userName) {
                el.remove();
                break;
            }
        }
    }
}

function initUserlist(users) {
    if (userlist instanceof HTMLElement) {
        userlist.innerHTML = "";
    }
    if (userlistMobile instanceof HTMLElement) {
        userlistMobile.innerHTML = "";
    }

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
        const el = createQueueItem(queue, video, i);
        queuewrapper.appendChild(el);
    }
}

function createCurrentVideoInfo(video) {
    const thumbnail = createThumbnail(video);
    const info = createVideoInfo(video);
    const el = document.createElement("div");
    el.classList.add("current-video-info");
    el.appendChild(thumbnail);
    el.appendChild(info);
    return el;
}

function createQueueItem(queue, video, index) {
    const thumbnail = createThumbnail(video);

    const info = createVideoInfo(video);

    const el = document.createElement("div");
    el.classList.add("queue-video");
    el.appendChild(thumbnail);
    el.appendChild(info);
    addQueueOrderControls(el, queue.length, index);
    return el;
}

function createThumbnail(video) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("thumbnail-wrapper");

    const image = document.createElement("img");
    image.src = video.thumbnail;
    image.classList.add("thumbnail");
    wrapper.appendChild(image);

    const duration = document.createElement("div");
    duration.classList.add("video-duration");
    duration.innerText = formatNanoseconds(video.duration);
    wrapper.appendChild(duration);

    return wrapper;
}

function createVideoInfo(video) {
    const info = document.createElement("div");
    info.classList.add("video-info");

    const title = document.createElement("div");
    title.classList.add("video-title");
    title.innerText = video.title;
    info.appendChild(title);

    const channel = document.createElement("div");
    channel.classList.add("channel-title");
    channel.innerText = video.channel;
    info.appendChild(channel);

    const publishDate = new Date(video.publishedAt);
    const publishedAt = document.createElement("div");
    publishedAt.classList.add("published-at");
    publishedAt.innerText = formatDate(publishDate);
    info.appendChild(publishedAt);

    const queuedBy = document.createElement("div");
    queuedBy.classList.add("queued-by");
    queuedBy.innerText = "Queued by: " + video.queuedBy;
    info.appendChild(queuedBy);

    return info;
}

function addQueueOrderControls(parent, queueLength, i) {
    const controls = document.createElement("div");
    controls.classList.add("queue-controls");

    const a = document.createElement("div");
    controls.appendChild(a);
    const b = document.createElement("div");
    controls.appendChild(b);
    const c = document.createElement("div");
    controls.appendChild(c);

    const toTop = document.createElement("button");
    toTop.classList.add("btn", "up-arrow");
    toTop.innerText = "⇈";
    toTop.title = "Move to top";
    toTop.disabled = i === 0;
    toTop.addEventListener("click", () => reorderQueue(i, 0));
    b.appendChild(toTop);

    const up = document.createElement("button");
    up.classList.add("btn", "up-arrow");
    up.innerText = "↑";
    up.title = "Move up";
    up.disabled = i === 0;
    up.addEventListener("click", () => reorderQueue(i, i - 1));
    a.appendChild(up);

    const down = document.createElement("button");
    down.classList.add("btn", "down-arrow");
    down.innerText = "↓";
    down.title = "Move down";
    down.disabled = i === queueLength - 1;
    down.addEventListener("click", () => reorderQueue(i, i + 1));
    a.appendChild(down);

    const toBottom = document.createElement("button");
    toBottom.classList.add("btn", "down-arrow");
    toBottom.innerText = "⇊";
    toBottom.title = "Move to bottom";
    toBottom.disabled = i === queueLength - 1;
    toBottom.addEventListener("click", () => reorderQueue(i, queueLength - 1));
    b.appendChild(toBottom);

    const remove = document.createElement("button");
    remove.innerText = "⨯";
    remove.title = "Remove from queue";
    remove.classList.add("btn", "destructive");
    remove.addEventListener("click", () => removeFromQueue(i));
    c.appendChild(remove);

    parent.appendChild(controls);
}

function formatDate(date) {
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
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
