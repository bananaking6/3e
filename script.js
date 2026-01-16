const PROXY_ENABLED = true;
const PROXY_VALUE = PROXY_ENABLED
  ? "https://api.codetabs.com/v1/proxy?quest="
  : "";
const API = PROXY_VALUE + "https://triton.squid.wtf";
// https://tidal.kinoplus.online/
const LYRICS_WORKER =
  PROXY_VALUE + "https://lyricsplus.prjktla.workers.dev/v2/lyrics/get";
const IMG = PROXY_VALUE + "https://resources.tidal.com/images/";
const audio = document.getElementById("audio");
const seek = document.getElementById("seek");
const lyricsView = document.getElementById("lyricsView");
const queueView = document.getElementById("queueView");
const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d");

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
function renderSongs(d, c) {
  const tracks = d?.tracks?.items || d?.items || [];
  const seen = new Set();

  tracks.forEach((t) => {
    const key = `${t.title.toLowerCase()}|${(t.artists || [])
      .map((a) => a.name.toLowerCase())
      .sort()
      .join(",")}`;

    if (seen.has(key)) return; // skip duplicate
    seen.add(key);

    const img = t?.album?.cover
      ? `${IMG}${t.album.cover.replaceAll("-", "/")}/160x160.jpg`
      : "";
    c.appendChild(card(img, t.title, () => addToQueue(t)));
  });
}

function renderArtists(d, c) {
  const artists = d?.artists?.items || d?.items || [];
  const seen = new Set();

  artists.forEach((a) => {
    // Skip artists without an ID or without a picture
    if (!a.id || !a.picture) return;

    // Normalize the name: lowercase, remove spaces and dashes
    const key = a.name.toLowerCase().replace(/[\s-]/g, "");

    if (seen.has(key)) return; // skip duplicates
    seen.add(key);

    const img = `${IMG}${a.picture.replaceAll("-", "/")}/160x160.jpg`;
    c.appendChild(card(img, a.name, () => openArtist(a.id, a.name, a.picture)));
  });
}

function renderAlbums(d, c) {
  const albums = d?.albums?.items || d?.items || [];
  const seen = new Set();

  albums.forEach((al) => {
    const key = `${al.title.toLowerCase()}|${(al.artists || [])
      .map((a) => a.name.toLowerCase())
      .sort()
      .join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);

    const img = al.cover
      ? `${IMG}${al.cover.replaceAll("-", "/")}/160x160.jpg`
      : "";
    c.appendChild(card(img, al.title, () => openAlbum(al)));
  });
}

function renderPlaylists(d, c) {
  const pls = d?.playlists?.items || d?.items || [];
  const seen = new Set();

  pls.forEach((p) => {
    const key = p.title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const img = p.picture
      ? `${IMG}${p.picture.replaceAll("-", "/")}/160x160.jpg`
      : "";
    c.appendChild(card(img, p.title, () => alert("Playlist page coming soon")));
  });
}

/* --- QUEUE --- */

// Simple toast function
function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.bottom = "120px";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.background = "#1db954"; // green accent
  toast.style.color = "#fff";
  toast.style.padding = "10px 20px";
  toast.style.borderRadius = "6px";
  toast.style.boxShadow = "0 2px 10px rgba(0,0,0,0.4)";
  toast.style.zIndex = 1000;
  toast.style.opacity = 0;
  toast.style.transition = "opacity 0.3s ease";

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
  });
}

// Toggle queue visibility
function toggleQueue() {
  queueView.classList.toggle("hidden");
}

/* --- PLAYER --- */

// Object to hold preloaded next track URLs
const preloadedAudio = {}; // key: track index, value: URL string

// Load a track immediately
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
  document.getElementById("playerCover").src = img;
  document.getElementById("bg").style.backgroundImage = `url(${img})`;
  document.getElementById("playerTitle").textContent =
    track.title || "Unknown Title";
  document.getElementById("playerArtist").textContent =
    track.artists?.[0]?.name || "Unknown Artist";

  // Get track URL (streaming, 206 Partial Content)
  let trackUrl;
  if (preloadedAudio[trackIndex]) {
    trackUrl = preloadedAudio[trackIndex];
  } else {
    trackUrl = await getTrackUrl(track);
  }

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
    `${API}/track/?id=${track.id}${PROXY_ENABLED ? "%26" : "&"}quality=LOSSLESS`,
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

  try {
    let url = `${LYRICS_WORKER}?title=${encodeURIComponent(
      track.title,
    )}&artist=${encodeURIComponent(
      track.artists?.[0]?.name || "",
    )}&duration=${Math.floor(track.duration)}&type=Word`;

    if (PROXY_ENABLED) url = url.replaceAll("%20", "_").replaceAll("&", "%26");

    const data = await fetch(url).then((r) => r.json());

    if (data?.lyrics?.length) {
      data.lyrics.forEach((line) => {
        // container for one lyric line
        const lineDiv = document.createElement("div");
        lineDiv.className = "lyric-line";
        lineDiv.dataset.time = line.time;

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
          // fallback if no word timings
          lineDiv.textContent = line.text;
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
  seek.value = (audio.currentTime / audio.duration) * 100 || 0;
  if (!words.length) return;

  const now = audio.currentTime * 1000;

  let currentWord = null;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const start = w.time;
    const end = w.time + w.duration;

    if (now >= start && now <= end) {
      const progress = (now - start) / w.duration;
      w.el.classList.add("active");
      w.el.style.setProperty("--p", progress);
      currentWord = w;
    } else if (now > end) {
      w.el.classList.add("active");
      w.el.style.setProperty("--p", 1);
    } else {
      w.el.classList.remove("active");
      w.el.style.setProperty("--p", 0);
    }
  }

  currentWord?.el.scrollIntoView({
    block: "center",
    behavior: "smooth",
  });
};

/* --- ARTIST PAGE --- */
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

  // ===== Deduplicate albums =====
  const deduplicateAlbums = (albums) => {
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
  };
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
      container.appendChild(d);
    });
    row.appendChild(container);
    content.appendChild(row);
  }

  // ===== Render albums =====
  if (albums.length) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = "<h3>Albums</h3>";
    const container = document.createElement("div");
    container.className = "cards";
    albums.forEach((al) => {
      const img = al.cover
        ? `${IMG}${al.cover.replaceAll("-", "/")}/160x160.jpg`
        : "";
      container.appendChild(card(img, al.title, () => openAlbum(al)));
    });
    row.appendChild(container);
    content.appendChild(row);
  }

  // ===== Render singles/EPs =====
  if (epsAndSingles.length) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = "<h3>EPs & Singles</h3>";
    const container = document.createElement("div");
    container.className = "cards";
    epsAndSingles.forEach((al) => {
      const img = al.cover
        ? `${IMG}${al.cover.replaceAll("-", "/")}/160x160.jpg`
        : "";
      container.appendChild(card(img, al.title, () => openAlbum(al)));
    });
    row.appendChild(container);
    content.appendChild(row);
  }
}

/* --- ALBUM PAGE --- */
async function openAlbum(al) {
  showView("album");
  const el = document.getElementById("album");
  // format al.releaseDate
  const date = new Date(al.releaseDate);
  releaseDate = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  // format al.duration in minutes and seconds
  const minutes = Math.floor(al.duration / 60);
  const seconds = al.duration % 60;
  duration = `${minutes}m ${seconds}s`;
  console.log(al)
  el.innerHTML = `
  <h2>${al.title}</h2>
  <img src="${IMG}${al.cover.replaceAll("-", "/")}/160x160.jpg">
  <h3>${al.artists[0].name} - ${releaseDate}</h3>
  <span id="albumInfo">${al.numberOfTracks} songs • ${duration} • ${al.copyright}</span><br>
  <button id="playAll">▶ Play All</button>
  <button id="shufflePlay">🔀 Shuffle Play</button>
  <div id="albumTracks"></div>
  `;
  const data = await fetch(`${API}/album/?id=${al.id}`).then((r) => r.json());
  const tracks = data?.data?.items || [];
  tracks.forEach((t) => {
    const d = document.createElement("div");
    d.className = "song-row";
    d.textContent = t.item.title;
    d.onclick = () => addToQueue(t.item);
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
    gradient.addColorStop(0, "#1db954");
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, canvas.height - y);
  });
}
