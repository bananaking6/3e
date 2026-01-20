const PROXY_ENABLED = false;
const PROXY_VALUE = PROXY_ENABLED
  ? "https://api.codetabs.com/v1/proxy/?quest="
  : "";
const API = PROXY_VALUE + "https://triton.squid.wtf";
// https://tidal.kinoplus.online/
const LYRICS_WORKER = "https://lyricsplus.prjktla.workers.dev/v2/lyrics/get";
const IMG = PROXY_VALUE + "https://resources.tidal.com/images/";
const audio = document.getElementById("audio");
const lyricsView = document.getElementById("lyricsView");
const queueView = document.getElementById("queueView");
const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d");
const link = document.querySelector("link[rel~='icon']");

let queue = [],
  index = 0,
  words = [],
  audioCtx,
  analyser,
  source;

/* --- SPA --- */
function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

/* --- SEARCH --- */
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter")
    searchAll(
      PROXY_ENABLED
        ? searchInput.value.replaceAll(" ", "-")
        : searchInput.value,
    );
});

async function searchAll(q) {
  searchResults.innerHTML = "";
  await searchSection("Songs", "s", q, renderSongs);
  await searchSection("Artists", "a", q, renderArtists);
  await searchSection("Albums", "al", q, renderAlbums);
  //await searchSection("Playlists", "p", q, renderPlaylists);
}

async function searchSection(title, param, q, render) {
  const res = await fetch(`${API}/search/?${param}=${encodeURIComponent(q)}`);
  const data = await res.json();
  if (!data?.data) return;
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<h3>${title}</h3><div class="cards"></div>`;
  searchResults.appendChild(row);
  render(data.data, row.querySelector(".cards"));
}

/* --- CARD --- */
function card(img, title, onclick) {
  const d = document.createElement("div");
  d.className = "card";
  d.innerHTML = `<img src="${img || ""}"><div>${title}</div>`;

  // Left click
  d.onclick = onclick;

  return d;
}

/* --- RENDERERS --- */
function renderGenericList(
  items,
  container,
  keyFn,
  imgFn,
  titleFn,
  clickFn,
  filterFn = () => true,
) {
  const seen = new Set();
  items.forEach((item) => {
    if (!filterFn(item)) return;
    const key = keyFn(item);
    if (seen.has(key)) return;
    seen.add(key);
    container.appendChild(
      card(imgFn(item), titleFn(item), () => clickFn(item)),
    );
  });
}

function renderSongs(d, c) {
  const tracks = d?.tracks?.items || d?.items || [];
  renderGenericList(
    tracks,
    c,
    (t) =>
      `${t.title.toLowerCase()}|${(t.artists || [])
        .map((a) => a.name.toLowerCase())
        .sort()
        .join(",")}`,
    (t) =>
      t?.album?.cover
        ? `${IMG}${t.album.cover.replaceAll("-", "/")}/160x160.jpg`
        : "",
    (t) => t.title,
    (t) => addToQueue(t),
  );
}

function renderArtists(d, c) {
  const artists = d?.artists?.items || d?.items || [];
  renderGenericList(
    artists,
    c,
    (a) => a.name.toLowerCase().replace(/[\s-]/g, ""),
    (a) => `${IMG}${a.picture.replaceAll("-", "/")}/160x160.jpg`,
    (a) => a.name,
    (a) => openArtist(a.id, a.name, a.picture),
    (a) => a.id && a.picture,
  );
}

function renderAlbums(d, c) {
  const albums = d?.albums?.items || d?.items || [];
  renderGenericList(
    albums,
    c,
    (al) =>
      `${al.title.toLowerCase()}|${(al.artists || [])
        .map((a) => a.name.toLowerCase())
        .sort()
        .join(",")}`,
    (al) =>
      al.cover ? `${IMG}${al.cover.replaceAll("-", "/")}/160x160.jpg` : "",
    (al) => al.title,
    (al) => openAlbum(al),
  );
}

function renderPlaylists(d, c) {
  const pls = d?.playlists?.items || d?.items || [];
  renderGenericList(
    pls,
    c,
    (p) => p.title.toLowerCase(),
    (p) =>
      p.picture ? `${IMG}${p.picture.replaceAll("-", "/")}/160x160.jpg` : "",
    (p) => p.title,
    () => alert("Playlist page coming soon"),
  );
}

/* --- QUEUE --- */

// Simple toast function
function showToast(message) {
  const toast = document.createElement("div");
  toast.classList.add("toast");
  toast.textContent = message;

  document.body.appendChild(toast);

  // Fade in
  requestAnimationFrame(() => (toast.style.opacity = 1));

  // Fade out after 2 seconds
  setTimeout(() => {
    toast.style.opacity = 0;
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Clear the queue
function clearQueue() {
  preloadedAudio = {};
  queue = [];
  index = 0;
  updateQueue();
}

// Add track to queue with double-click detection
function addToQueue(track) {
  // Check if same as last song in queue
  const lastTrack = queue[queue.length - 1];
  if (lastTrack && lastTrack.id === track.id) {
    queue = [track]; // reset queue
    index = 0;
    loadTrack(track); // play immediately
    showToast(`"${track.title}" is already in queue — restarted!`);
    updateQueue();
    return;
  }

  // Normal add
  queue.push(track);
  updateQueue();
  showToast(`"${track.title}" added to queue (double click to play now)`);

  // Play immediately if first track
  if (queue.length === 1) loadTrack(track);
}

// Update queue UI
function updateQueue() {
  queueView.innerHTML = "<h3>Queue</h3>";
  queue.forEach((t, i) => {
    const d = document.createElement("div");
    d.textContent = t.title;
    d.onclick = () => {
      index = i;
      loadTrack(t);
    };
    queueView.appendChild(d);
    queueView.appendChild(document.createElement("br"));
  });
}

// Toggle queue visibility
function toggleQueue() {
  queueView.classList.toggle("hidden");
}

/* --- PLAYER --- */

// Object to hold preloaded next track URLs
let preloadedAudio = {}; // key: track index, value: URL string

// Load a track immediately
// Function to lighten/darken a hex color
function adjustColor(hex, percent) {
  let num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;

  r = Math.min(255, Math.max(0, r + percent));
  g = Math.min(255, Math.max(0, g + percent));
  b = Math.min(255, Math.max(0, b + percent));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

async function loadTrack(trackOrIndex) {
  let trackIndex;
  let track;

  if (typeof trackOrIndex === "number") {
    trackIndex = trackOrIndex;
    track = queue[trackIndex];
  } else if (typeof trackOrIndex === "object") {
    track = trackOrIndex;
    trackIndex = queue.findIndex((t) => t.id === track.id);
  } else {
    console.warn("loadTrack: invalid argument", trackOrIndex);
    return;
  }

  if (!track) {
    console.warn(`loadTrack: no track found for`, trackOrIndex);
    return;
  }

  // Update UI
  const img = track?.album?.cover
    ? `${IMG}${track.album.cover.replaceAll("-", "/")}/320x320.jpg`
    : "=";
  link.href = img;
  document.getElementById("playerCover").src = img;
  document.getElementById("bg").style.backgroundImage = `url(${img})`;
  document.getElementById("playerTitle").textContent =
    track.title || "Unknown Title";
  document.getElementById("playerArtist").textContent =
    `${track.artists?.[0]?.name || "Unknown Artist"} - ${track.album.title || ""}`;

  document.title = `${track.title || "Unknown Title"} - ${
    track.artists?.[0]?.name || "Unknown Artist"
  }`;

  // Set main and secondary colors dynamically
  document.documentElement.style.setProperty(
    "--main-color",
    track.album.vibrantColor,
  );

  // Secondary color: 40 lighter (positive) or darker (negative)
  document.documentElement.style.setProperty(
    "--secondary-color",
    adjustColor(track.album.vibrantColor, -50),
  );

  // update queue highlight
  const queueItems = queueView.querySelectorAll("div");
  queueItems.forEach((item, i) => {
    if (i === index) {
      item.classList.add("current");
    } else {
      item.classList.remove("current");
    }
  });
  saveSessionStorage();

  document.getElementById("playerArtist").onclick = () => {
    if (track.artists?.[0]?.id) {
      openArtist(
        track.artists[0].id,
        track.artists[0].name,
        track.artists[0].picture || "",
      );
    }
  };

  document.getElementById("playerCover").onclick = () => {
    // fetch the album
    fetch(`${API}/album/?id=${track.album.id}`)
      .then((r) => r.json())
      .then((data) => {
        openAlbum(data.data);
      });
  };

  // Get track URL (streaming, 206 Partial Content)
  let trackUrl;
  if (preloadedAudio[trackIndex]) {
    trackUrl = preloadedAudio[trackIndex];
  } else {
    trackUrl = await getTrackUrl(track);
  }

  //console.log("downloadSong", track, trackUrl, img);

  // Swap audio instantly
  audio.src = trackUrl;
  initAudioContext();
  audio.play();
  loadLyrics(track);

  // Preload the next track (streaming)
  if (trackIndex + 1 < queue.length)
    preloadTrack(queue[trackIndex + 1], trackIndex + 1);
}

// Preload a track (streaming)
async function preloadTrack(track, trackIndex) {
  if (preloadedAudio[trackIndex]) return; // already preloaded
  const url = await getTrackUrl(track);
  preloadedAudio[trackIndex] = url;
}

// Get streaming track URL
async function getTrackUrl(track) {
  const res = await fetch(
    `${API}/track/?id=${track.id}${PROXY_ENABLED ? "%26" : "&"}quality=LOW`,
  );
  const data = await res.json();
  const trackUrl = PROXY_ENABLED
    ? PROXY_VALUE + JSON.parse(atob(data.data.manifest)).urls[0]
    : JSON.parse(atob(data.data.manifest)).urls[0];
  return trackUrl; // leave as direct URL for streaming (206)
}

// Next / Previous tracks
function next() {
  if (index + 1 < queue.length) {
    index++;
    loadTrack(index);
  }
}

function prev() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
  } else if (index > 0) {
    index--;
    loadTrack(index);
  }
}

// Play/pause toggle
function togglePlay() {
  initAudioContext();
  audio.paused ? audio.play() : audio.pause();
}

// Lyrics toggle
function toggleLyrics() {
  lyricsView.classList.toggle("hidden");
}

// Seek bar
seek.oninput = () => (audio.currentTime = (seek.value / 100) * audio.duration);

// Auto-next
audio.onended = next;

/* --- LYRICS --- */
async function loadLyrics(track) {
  lyricsView.innerHTML = "";
  words = [];
  lines = []; // store line timing info

  try {
    let url = `${LYRICS_WORKER}?title=${encodeURIComponent(
      track.title,
    )}&artist=${encodeURIComponent(track.artists?.[0]?.name || "")}&duration=${Math.floor(track.duration)}&type=Word`;

    url = `https://api.codetabs.com/v1/proxy/?quest=${LYRICS_WORKER}?isrc=${track.isrc}`;

    if (PROXY_ENABLED) url = url.replaceAll("%20", "_").replaceAll("&", "%26");

    const data = await fetch(url).then((r) => r.json());

    console.log(data);

    if (data?.lyrics?.length) {
      data.lyrics.forEach((line) => {
        const lineDiv = document.createElement("div");
        lineDiv.className = "lyric-line";
        lineDiv.dataset.time = line.time;
        lineDiv.dataset.duration = line.duration || 2000; // fallback for line duration

        // store line info for line-level timing
        lines.push({
          time: line.time,
          duration: line.duration || 2000,
          el: lineDiv,
        });

        if (line.syllabus?.length) {
          line.syllabus.forEach((w) => {
            const word = {
              text: w.text,
              time: w.time,
              duration: w.duration || 150,
              el: null,
            };

            const span = document.createElement("span");
            span.textContent = w.text;
            span.className = "word";
            span.dataset.time = w.time;

            span.onclick = () => {
              audio.currentTime = w.time / 1000;
            };

            lineDiv.appendChild(span);
            word.el = span;
            words.push(word);
          });
        } else {
          // fallback line (no word timing)
          lineDiv.textContent = line.text;

          // --- Add click support for line elements ---
          lineDiv.style.cursor = "pointer";
          lineDiv.onclick = () => {
            audio.currentTime = line.time / 1000;
          };
        }

        lyricsView.appendChild(lineDiv);
      });
    } else {
      lyricsView.textContent = "No lyrics available";
    }
  } catch (e) {
    console.error(e);
    lyricsView.textContent = "Lyrics unavailable";
  }
}

audio.ontimeupdate = () => {
  saveSessionStorage();
  if (!words.length && !lines.length) return;

  const now = audio.currentTime * 1000; // in ms
  let currentWordOrLine = null;

  // --- Word by word highlighting ---
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const start = w.time;
    const end = w.time + w.duration;

    if (now >= start && now <= end) {
      const progress = (now - start) / w.duration;
      w.el.classList.add("active");
      w.el.style.setProperty("--p", progress);
      currentWordOrLine = w;
    } else if (now > end) {
      w.el.classList.add("old");
      w.el.classList.add("active");
      w.el.style.setProperty("--p", 1);
    } else {
      w.el.classList.remove("active");
      w.el.classList.remove("old");
      w.el.style.setProperty("--p", 0);
    }
  }

  // --- Line by line highlighting fallback ---
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const start = line.time;
    const end = line.time + line.duration;

    if (now >= start && now <= end) {
      const progress = (now - start) / line.duration;
      line.el.classList.add("active");
      line.el.style.setProperty("--p", progress);
      currentWordOrLine ??= { el: line.el }; // scroll line if no word active
    } else if (now > end || now < start) {
      line.el.classList.remove("active");
      line.el.style.setProperty("--p", 0);
    }
  }

  // Scroll currently active word or line into view
  currentWordOrLine?.el.scrollIntoView({
    block: "center",
    behavior: "smooth",
  });
};

/* --- Favorites Page --- */
function openFavorites() {
  openAlbum({
    title: "FAVORITES",
    type: "PLAYLIST",
    cover: "5b22b4ad-2358-4418-acae-2a2c226e5945",
    artists: [{ name: "You" }],
    playlistTracks: JSON.parse(localStorage.favorites),
    duration: localStorage.favoritesDuration,
    numberOfTracks: localStorage.favoritesLength,
  });
}

function favoriteTrack(track, e) {
  if (e) e.preventDefault();
  // add track to localStorage
  let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
  // check if track is already in favorites
  if (favorites.find((t) => t.id === track.id)) {
    showToast(`Removed "${track.title}" from favorites`);
    favorites = favorites.filter((t) => t.id !== track.id);
    localStorage.setItem("favorites", JSON.stringify(favorites));
    localStorage.setItem("favoritesLength", favorites.length);
    let duration = 0;
    favorites.forEach((t) => {
      duration += t.duration;
    });
    localStorage.setItem("favoritesDuration", duration);
    return;
  }
  favorites.push(track);
  localStorage.setItem("favorites", JSON.stringify(favorites));
  localStorage.setItem("favoritesLength", favorites.length);
  let duration = 0;
  favorites.forEach((t) => {
    duration += t.duration;
  });
  localStorage.setItem("favoritesDuration", duration);
  showToast(`Favorited "${track.title}"`);
}

/* --- ARTIST PAGE --- */
// ===== Deduplicate albums =====
function deduplicateAlbums(albums) {
  const unique = new Map();
  for (const album of albums) {
    if (!album || !album.title) continue;
    const key = JSON.stringify([album.title, album.numberOfTracks || 0]);
    if (unique.has(key)) {
      const existing = unique.get(key);
      const existingExplicit = existing.explicit || false;
      const newExplicit = album.explicit || false;
      if (newExplicit && !existingExplicit) {
        unique.set(key, album);
        continue;
      }
      if (!newExplicit && existingExplicit) continue;
      const existingTags = existing.mediaMetadata?.tags?.length || 0;
      const newTags = album.mediaMetadata?.tags?.length || 0;
      if (newTags > existingTags) {
        unique.set(key, album);
        continue;
      }
      if ((album.popularity || 0) > (existing.popularity || 0)) {
        unique.set(key, album);
      }
    } else {
      unique.set(key, album);
    }
  }
  return Array.from(unique.values());
}

async function openArtist(id, name, pic) {
  showView("artist");
  const el = document.getElementById("artist");
  el.innerHTML = `<div id="artistBanner">
        <img src='${IMG + pic.replaceAll("-", "/")}/750x750.jpg' alt="artist">
        <h2>${name}</h2>
    </div>
    <div id="artistContent"></div>`;

  const content = document.getElementById("artistContent");

  const [primaryResponse, contentResponse] = await Promise.all([
    fetch(`${API}/artist/?id=${id}`),
    fetch(`${API}/artist/?f=${id}&skip_tracks=true`),
  ]);

  const primaryJson = await primaryResponse.json();
  const primaryData = primaryJson.data || primaryJson;
  const rawArtist =
    primaryData.artist ||
    (Array.isArray(primaryData) ? primaryData[0] : primaryData);

  const contentJson = await contentResponse.json();
  const contentData = contentJson.data || contentJson;
  const entries = Array.isArray(contentData) ? contentData : [contentData];

  const albumMap = new Map();
  const trackMap = new Map();
  const isTrack = (v) => v?.id && v.duration && v.album;
  const isAlbum = (v) => v?.id && "numberOfTracks" in v;

  const scan = (value, visited = new Set()) => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach((item) => scan(item, visited));
      return;
    }

    const item = value.item || value;
    if (isAlbum(item)) albumMap.set(item.id, item);
    if (isTrack(item)) trackMap.set(item.id, item);
    Object.values(value).forEach((n) => scan(n, visited));
  };
  entries.forEach((entry) => scan(entry));

  const allAlbums = deduplicateAlbums(Array.from(albumMap.values()));

  // Separate full albums and singles/EPs
  const albums = allAlbums.filter((a) => !["EP", "SINGLE"].includes(a.type));
  const epsAndSingles = allAlbums.filter((a) =>
    ["EP", "SINGLE"].includes(a.type),
  );

  // ===== Render top tracks =====
  const tracks = Array.from(trackMap.values())
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 15);

  if (tracks.length) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = "<h3>Top Tracks</h3>";
    const container = document.createElement("div");
    tracks.forEach((t) => {
      const d = document.createElement("div");
      d.className = "song-row";
      d.textContent = t.title;
      d.onclick = () => addToQueue(t);
      d.oncontextmenu = (e) => {
        e.preventDefault();
        // fetch the album
        fetch(`${API}/album/?id=${t.album.id}`)
          .then((r) => r.json())
          .then((data) => {
            const fullTrack = data?.data?.items.find(
              (item) => item.item.id === t.id,
            )?.item;
            if (fullTrack) {
              favoriteTrack(fullTrack);
              showToast(`Favorited "${t.title}"`);
            } else {
              showToast("Failed to favorite track");
            }
          });
      };
      container.appendChild(d);
    });
    row.appendChild(container);
    content.appendChild(row);
  }

  const renderSection = (title, items) => {
    if (!items.length) return;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<h3>${title}</h3>`;
    const container = document.createElement("div");
    container.className = "cards";
    renderGenericList(
      items,
      container,
      (al) => al.id,
      (al) =>
        al.cover ? `${IMG}${al.cover.replaceAll("-", "/")}/160x160.jpg` : "",
      (al) => al.title,
      (al) => openAlbum(al),
    );
    row.appendChild(container);
    content.appendChild(row);
  };

  renderSection("Albums", albums);
  renderSection("EPs & Singles", epsAndSingles);
}

/* --- ALBUM PAGE --- */
async function openAlbum(al) {
  showView("album");
  const el = document.getElementById("album");
  // format al.releaseDate
  let dateStr = "";
  if (al.releaseDate) {
    try {
      const date = new Date(al.releaseDate);
      dateStr = date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (e) {}
  }

  el.innerHTML = `
  <img src="${IMG}${al.cover.replaceAll("-", "/")}/160x160.jpg">
  <h2>${al.title}</h2>
  <h3>${al.artists[0].name}${dateStr ? " • " + dateStr : ""}</h3>
  <span id="albumInfo">${al.numberOfTracks} songs • ${formatTime(al.duration)}${
    al.copyright ? " • " + al.copyright : ""
  }</span>
  <div style="margin-top: 20px;">
    <button id="playAll">PLAY</button>
    <button id="shufflePlay">SHUFFLE</button>
  </div>
  <div id="albumTracks"></div>
  `;
  let tracks = [];
  if (al.type == "PLAYLIST") {
    // Custom Playlist: use stored tracks
    tracks = al.playlistTracks.map((t) => ({ item: t }));
  } else {
    // Regular album: fetch from API
    const data = await fetch(`${API}/album/?id=${al.id}`).then((r) => r.json());
    tracks = data?.data?.items || [];
  }

  tracks.forEach((t) => {
    const d = document.createElement("div");
    d.className = "song-row";
    d.innerHTML = `
    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${
      t.item.title
    }</span>
    ${t.item.explicit ? '<img src="e.svg">' : ""}
    <span class="right">${formatTime(t.item.duration)}</span>`;
    d.onclick = () => addToQueue(t.item);
    d.oncontextmenu = (e) => {
      e.preventDefault();
      favoriteTrack(t.item);
    };
    document.getElementById("albumTracks").appendChild(d);
  });
  document.getElementById("playAll").onclick = () => {
    clearQueue();
    tracks.forEach((t) => queue.push(t.item));
    index = queue.length - tracks.length;
    loadTrack(queue[index]);
    updateQueue();
  };
  document.getElementById("shufflePlay").onclick = () => {
    clearQueue();
    let shuffled = [];
    tracks.forEach((t) => shuffled.push({ item: t.item }));
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((t) => queue.push(t.item));
    index = queue.length - shuffled.length;
    loadTrack(queue[index]);
    updateQueue();
  };
}

/* --- VISUALIZER --- */
function initAudioContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source = audioCtx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
  draw();
}

function draw() {
  requestAnimationFrame(draw);
  if (!analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const barWidth = canvas.width / data.length;
  data.forEach((v, i) => {
    const x = i * barWidth;
    const y = canvas.height - (v / 255) * canvas.height;
    const gradient = ctx.createLinearGradient(x, 0, x, canvas.height);
    const computedStyles = window.getComputedStyle(document.body);
    gradient.addColorStop(0, computedStyles.getPropertyValue("--main-color"));
    gradient.addColorStop(
      1,
      computedStyles.getPropertyValue("--secondary-color"),
    );
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, canvas.height - y);
  });
}

function saveSessionStorage() {
  // sessionStorage queue info
  let sessionQueue = queue.map((obj) => JSON.stringify(obj)).join(", ");
  sessionStorage.setItem(
    "queue",
    JSON.stringify({
      items: sessionQueue,
      i: index,
      currentTime: audio.currentTime,
    }),
  );
}

function loadSessionStorage() {
  window.newQueue = JSON.parse(sessionStorage.getItem("queue"));
  queue = JSON.parse("[" + newQueue.items + "]");
  index = newQueue.i;
  updateQueue();
  loadTrack(index);
  audio.currentTime = newQueue.currentTime;
}

if (sessionStorage.getItem("queue")) loadSessionStorage();

const seekBar = document.getElementById("seekBar");
const progressBar = document.getElementById("progressBar");
const bufferBar = document.getElementById("bufferBar");
const seekIndicator = document.getElementById("seekIndicator");
const timeTooltip = document.getElementById("timeTooltip");
const currentTimeEl = document.getElementById("currentTime");
const totalTimeEl = document.getElementById("totalTime");

let isDragging = false;

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function updateProgress() {
  if (!audio.duration) return;

  const pct = (audio.currentTime / audio.duration) * 100;
  progressBar.style.width = pct + "%";
  currentTimeEl.textContent = formatTime(audio.currentTime);
  totalTimeEl.textContent = formatTime(audio.duration);

  if (audio.buffered.length) {
    const end = audio.buffered.end(audio.buffered.length - 1);
    bufferBar.style.width = (end / audio.duration) * 100 + "%";
  }
}

function seek(clientX) {
  const rect = seekBar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  audio.currentTime = pct * audio.duration;
}

// Mouse
seekBar.addEventListener("mousedown", (e) => {
  isDragging = true;
  seek(e.clientX);
});
window.addEventListener("mousemove", (e) => {
  if (isDragging) seek(e.clientX);
});
window.addEventListener("mouseup", () => (isDragging = false));

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
  } else if (e.code === "ArrowRight") {
    if (audio.duration)
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  } else if (e.code === "ArrowLeft") {
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  }
});

// Touch
seekBar.addEventListener("touchstart", (e) => {
  isDragging = true;
  seek(e.touches[0].clientX);
});
seekBar.addEventListener("touchmove", (e) => {
  if (isDragging) {
    seek(e.touches[0].clientX);
    e.preventDefault();
  }
});
seekBar.addEventListener("touchend", () => (isDragging = false));

// Hover tooltip
seekBar.addEventListener("mousemove", (e) => {
  const rect = seekBar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const hoverTime = audio.duration * pct;

  seekIndicator.style.left = pct * 100 + "%";
  seekIndicator.style.opacity = 1;

  timeTooltip.textContent = formatTime(hoverTime);
  timeTooltip.style.left = pct * 100 + "%";
  timeTooltip.style.opacity = 1;
});

seekBar.addEventListener("mouseleave", () => {
  seekIndicator.style.opacity = 0;
  timeTooltip.style.opacity = 0;
});

// Auto update
audio.addEventListener("timeupdate", updateProgress);
audio.addEventListener("progress", updateProgress);
audio.addEventListener("loadedmetadata", updateProgress);

function downloadSong(track, mp3Url, coverUrl) {
  // Create a filename-friendly version of the track title
  const fileName = `${track.title} - ${track.artists.map((a) => a.name).join(", ")}.mp3`;

  // Download the MP3
  fetch(mp3Url)
    .then((response) => {
      if (!response.ok) throw new Error("Network response was not ok");
      return response.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      console.log(`Downloaded "${fileName}"`);
    })
    .catch((error) => console.error("Error downloading MP3:", error));
}
