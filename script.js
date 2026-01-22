const PROXY_ENABLED = document.location.hostname == "localhost" ? false : true;
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
}

async function searchSection(title, param, q, render) {
  const res = await fetch(`${API}/search/%3F${param}=${encodeURIComponent(q)}`);
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
  d.title = title;
  d.className = "card";
  d.innerHTML = `<img src="${img || ""}"><span>${title}</span>`;

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
        ? `${IMG}${t.album.cover.replaceAll("-", "/")}/320x320.jpg`
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
    (a) => `${IMG}${a.picture.replaceAll("-", "/")}/320x320.jpg`,
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
      al.cover ? `${IMG}${al.cover.replaceAll("-", "/")}/320x320.jpg` : "",
    (al) => al.title,
    (al) => openAlbum(al),
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

  // Set colors
  document.documentElement.style.setProperty(
    "--main-color",
    track.album.vibrantColor,
  );
  document.documentElement.style.setProperty(
    "--secondary-color",
    adjustColor(track.album.vibrantColor, -50),
  );

  // Queue highlight
  const queueItems = queueView.querySelectorAll("div");
  queueItems.forEach((item, i) => {
    item.classList.toggle("current", i === trackIndex);
  });
  saveSessionStorage();

  // Artist & cover click handlers
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
    fetch(`${API}/album/%3Fid=${track.album.id}`)
      .then((r) => r.json())
      .then((data) => openAlbum(data.data));
  };

  // --- Preload / playback logic with Blob ---
  let trackData;

  if (preloadedAudio[trackIndex]) {
    // Already preloaded
    trackData = preloadedAudio[trackIndex];
  } else {
    // Fetch streaming URL
    const trackUrl = await getTrackUrl(track);
    const response = await fetch(trackUrl);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    trackData = {
      blob,
      objectUrl,
      filename: `${track.title || "track"}.mp3`,
    };

    preloadedAudio[trackIndex] = trackData;
  }

  // Swap audio instantly
  audio.src = trackData.objectUrl;
  initAudioContext();
  audio.play();

  loadLyrics(track);

  // Preload next track in queue
  if (trackIndex + 1 < queue.length) {
    preloadTrack(queue[trackIndex + 1], trackIndex + 1);
  }
}

// Preload a track (streaming)
async function preloadTrack(track, trackIndex) {
  if (preloadedAudio[trackIndex]) return;

  const streamUrl = await getTrackUrl(track);

  const response = await fetch(streamUrl);
  const blob = await response.blob();

  const objectUrl = URL.createObjectURL(blob);

  preloadedAudio[trackIndex] = {
    blob,
    objectUrl,
  };
}

// Get streaming track URL
async function getTrackUrl(track) {
  const res = await fetch(
    `${API}/track/%3Fid=${track.id}${PROXY_ENABLED ? "%26" : "&"}quality=LOW`,
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
    releaseTrack();
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

// Reverse the audio from preloaded Blob and auto-play when ready
async function reverseAudio(trackIndex = index) {
  audio.pause();

  const cached = preloadedAudio[trackIndex];
  if (!cached || !cached.blob) {
    alert("Track not preloaded yet!");
    return;
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();

  // Read the Blob as ArrayBuffer
  const arrayBuffer = await cached.blob.arrayBuffer();

  // Decode audio data
  const buffer = await ctx.decodeAudioData(arrayBuffer);

  // Reverse each channel
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    buffer.getChannelData(c).reverse();
  }

  // Encode to WAV
  const wavBlob = bufferToWav(buffer);
  const url = URL.createObjectURL(wavBlob);

  // Auto-play when ready
  audio.oncanplaythrough = () => {
    audio.oncanplaythrough = null;
    audio.currentTime = 0;
    audio.play().catch(() => {
      console.warn("Autoplay blocked by browser");
    });
  };

  audio.src = url;
  audio.load();

  // ---- WAV encoder ----
  function bufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);

    let offset = 0;
    const writeString = (s) => {
      for (let i = 0; i < s.length; i++) {
        view.setUint8(offset++, s.charCodeAt(i));
      }
    };

    writeString("RIFF");
    view.setUint32(offset, 36 + length, true);
    offset += 4;
    writeString("WAVE");
    writeString("fmt ");
    view.setUint32(offset, 16, true);
    offset += 4;
    view.setUint16(offset, 1, true);
    offset += 2;
    view.setUint16(offset, numChannels, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, sampleRate * numChannels * 2, true);
    offset += 4;
    view.setUint16(offset, numChannels * 2, true);
    offset += 2;
    view.setUint16(offset, 16, true);
    offset += 2;
    writeString("data");
    view.setUint32(offset, length, true);
    offset += 4;

    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        let sample = buffer.getChannelData(c)[i];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
  }
}

function downloadTrack(trackIndex = index) {
  const cached = preloadedAudio[trackIndex];
  if (!cached) {
    alert("Track not preloaded yet");
    return;
  }

  const a = document.createElement("a");
  a.href = cached.objectUrl;
  a.download = cached.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function releaseTrack(trackIndex = index) {
  const cached = preloadedAudio[trackIndex];
  if (!cached) {
    return;
  }
  URL.revokeObjectURL(cached.objectUrl);
  delete preloadedAudio[trackIndex];
}

/* --- LYRICS --- */
async function loadLyrics(track) {
  lyricsView.innerHTML = "";
  words = [];
  lines = []; // store line timing info

  activeLyrics = false;
  try {
    let url = `${PROXY_VALUE}https://lyrics.paxsenix.org/apple-music/search?q=${encodeURIComponent(
      track.title + " " + track.artist.name,
    )}`;

    let data = await fetch(url).then((r) => r.json());

    let activeLyrics = null;

    data.forEach((lyricsID) => {
      if (lyricsID.isrc == track.isrc) {
        activeLyrics = lyricsID;
      }
    });

    //activeLyrics = { id: "1254572572" };
    if (!activeLyrics) return;

    url =
      PROXY_VALUE +
      `https://lyrics.paxsenix.org/apple-music/lyrics?id=${activeLyrics.id}`;

    data = await fetch(url).then((r) => r.json());

    const lyricsColors = [
      data.track.artwork.textColor1,
      data.track.artwork.textColor2,
      data.track.artwork.textColor3,
      data.track.artwork.textColor4,
      data.track.artwork.bgColor,
    ];

    // ---------- helpers ----------

    function createWordSpan(textData, wordPartRef) {
      const span = document.createElement("span");
      span.classList.add("word");
      span.innerText = (wordPartRef.value ? "" : " ") + textData.text;

      span.onclick = () => {
        audio.currentTime = textData.timestamp / 1000;
      };

      words.push({
        text: textData.text,
        time: textData.timestamp,
        duration: textData.duration || 150,
        el: span,
      });

      wordPartRef.value = !!textData.part;
      return span;
    }

    function renderTextArray(container, textArray) {
      const wordPartRef = { value: false };

      textArray.forEach((textData) => {
        const span = createWordSpan(textData, wordPartRef);
        container.appendChild(span);
      });
    }

    // ---------- render lyrics ----------

    data.content.forEach((line) => {
      const lineDiv = document.createElement("div");
      lineDiv.className = "lyric-line";

      lineDiv.dataset.time = line.timestamp;
      lineDiv.dataset.duration = line.duration || 2000;

      // metadata prefix
      const meta = [
        line.oppositeTurn && "[OPPOSITE]",
        line.background && "[BACKGROUND]",
        `[${line.structure}]`,
      ]
        .filter(Boolean)
        .join(" ");

      lineDiv.innerText = meta + " ";

      // main lyrics
      renderTextArray(lineDiv, line.text);

      // background lyrics
      if (line.backgroundText?.length) {
        const bgSpan = document.createElement("span");
        bgSpan.innerText = " | ";
        renderTextArray(bgSpan, line.backgroundText);
        lineDiv.appendChild(bgSpan);
      }

      lyricsView.appendChild(lineDiv);
    });
  } catch (e) {
    console.error(e);
    url = `${API}/lyrics/?id=${track.id}`;
    data = await fetch(url).then((r) => r.json());
    data = data.lyrics.subtitles;
    lines = data.split("\n");

    function parseTimeToMs(timeStr) {
      const [minutes, seconds] = timeStr.split(":");
      return (parseInt(minutes, 10) * 60 + parseFloat(seconds)) * 1000;
    }

    lines.forEach((line, index) => {
      const match = line.match(/\[(\d+:\d+\.\d+)\]\s*(.*)/);
      if (!match) return;

      const timeMs = parseTimeToMs(match[1]);
      const text = match[2];

      let durationMs;

      if (index < lines.length - 1) {
        const nextMatch = lines[index + 1].match(/\[(\d+:\d+\.\d+)\]/);
        if (!nextMatch) return;

        const nextTimeMs = parseTimeToMs(nextMatch[1]);
        durationMs = nextTimeMs - timeMs;
      } else {
        // last line → until audio ends
        durationMs = audio.duration * 1000 - timeMs;
      }

      const lineDiv = document.createElement("div");
      lineDiv.className = "lyric-line";
      lineDiv.innerText = text;
      lineDiv.dataset.time = timeMs; // milliseconds
      lineDiv.dataset.duration = durationMs; // milliseconds
      lines.push({ time: timeMs, duration: durationMs, el: lineDiv });

      lineDiv.onclick = () => {
        audio.currentTime = timeMs / 1000 + 1;
      };

      lyricsView.appendChild(lineDiv);
    });
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

/* --- PLAYLISTS --- */
if (!localStorage.getItem("playlist-favorites")) {
  createPlaylist("favorites", "Favorites");
  localStorage.setItem("playlist-favorites", true);
}
function openPlaylist(id) {
  let pl = JSON.parse(localStorage.getItem(`playlist_${id}`) || "null");
  if (pl) {
    openAlbum({
      title: pl.title,
      type: "PLAYLIST",
      cover: pl.cover || "5806b59b-2f3d-4d0a-8541-e75de4e58f2c",
      releaseDate: `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate() - 1}`,
      artists: [{ name: "You" }],
      playlistTracks: pl.tracks || "[]",
      duration: pl.duration,
      numberOfTracks: pl.numberOfTracks,
      id: pl.id,
    });
  } else {
    console.warn("Playlist not found:", id);
  }
}

function createPlaylist(id = crypto.randomUUID(), title = "Untitled Playlist") {
  const pl = {
    title: title,
    tracks: [],
    duration: 0,
    numberOfTracks: 0,
    id: id,
  };
  localStorage.setItem(`playlist_${id}`, JSON.stringify(pl));
  loadPlaylists();
}

function deletePlaylist(id) {
  localStorage.removeItem(`playlist_${id}`);
  loadPlaylists();
}

function addToPlaylist(id, track) {
  const key = `playlist_${id}`;
  const pl = JSON.parse(localStorage.getItem(key) || "null");

  if (!pl) return console.warn("Playlist not found:", id);

  const trackIndex = pl.tracks.findIndex((t) => t.id === track.id);

  if (trackIndex !== -1) {
    // Remove track
    pl.tracks.splice(trackIndex, 1);
    pl.duration = Math.max(0, (pl.duration || 0) - track.duration);
  } else {
    // Add track
    pl.tracks.push(track);
    pl.duration = (pl.duration || 0) + track.duration;
  }

  pl.numberOfTracks = pl.tracks.length;
  localStorage.setItem(key, JSON.stringify(pl));
}

function loadPlaylists() {
  let playlistsBar = document.getElementById("playlists");
  playlistsBar.innerHTML = "";
  for (let key in localStorage) {
    if (key.startsWith("playlist_")) {
      let pl = JSON.parse(localStorage.getItem(key));
      const plId = key.replace("playlist_", "");
      const plDiv = document.createElement("button");
      plDiv.textContent = pl.title;
      plDiv.onclick = () => openPlaylist(plId);
      playlistsBar.appendChild(plDiv);
    }
  }

  let pinnedBar = document.getElementById("pinned");
  pinnedBar.innerHTML = "";
  let pinned = JSON.parse(localStorage.getItem("pinned")) || [
    [
      "album",
      {
        id: 459844445,
        title: "Breach",
        duration: 2849,
        streamReady: true,
        payToStream: false,
        adSupportedStreamReady: true,
        djReady: true,
        stemReady: false,
        streamStartDate: "2025-07-18T00:00:00.000+0000",
        allowStreaming: true,
        premiumStreamingOnly: false,
        numberOfTracks: 13,
        numberOfVideos: 0,
        numberOfVolumes: 1,
        releaseDate: "2025-09-12",
        copyright: "© 2025 Fueled By Ramen LLC",
        type: "ALBUM",
        version: null,
        url: "http://www.tidal.com/album/459844445",
        cover: "65f6811b-379f-4aaf-aa7f-ce5d588398b6",
        vibrantColor: "#dc493c",
        videoCover: null,
        explicit: false,
        upc: "075679609908",
        popularity: 64,
        audioQuality: "LOSSLESS",
        audioModes: ["STEREO"],
        mediaMetadata: { tags: ["LOSSLESS", "HIRES_LOSSLESS"] },
        upload: false,
        artist: {
          id: 4664877,
          name: "twenty one pilots",
          handle: null,
          type: "MAIN",
          picture: "e884d40b-a2b3-4d5c-8f31-f4fc523ad506",
        },
        artists: [
          {
            id: 4664877,
            name: "twenty one pilots",
            handle: null,
            type: "MAIN",
            picture: "e884d40b-a2b3-4d5c-8f31-f4fc523ad506",
          },
        ],
      },
    ],
  ];
  pinned.forEach((pinnedItem) => {
    const pDiv = document.createElement("button");
    if (pinnedItem[0] == "album") {
      al = pinnedItem[1];
      pDiv.textContent = al.title;
      pDiv.onclick = () => openAlbum(al);
    } else if (pinnedItem[0] == "artist") {
      ar = pinnedItem[1];
      pDiv.textContent = ar[1];
      pDiv.onclick = () => openArtist(ar[0], ar[1], ar[2]);
    }
    pinnedBar.appendChild(pDiv);
  });
}

document.addEventListener("DOMContentLoaded", loadPlaylists);

function openAddToPlaylistModal(track) {
  if (!track) {
    if (
      typeof queue !== "undefined" &&
      queue.length > 0 &&
      typeof index !== "undefined"
    ) {
      track = queue[index];
    } else {
      showToast("No track selected");
      return;
    }
  }

  track = queue[index];
  const modal = document.getElementById("playlistModal");
  const list = document.getElementById("playlistList");
  list.innerHTML = "";

  modal.classList.remove("hidden");

  for (let key in localStorage) {
    if (key.startsWith("playlist_")) {
      try {
        let pl = JSON.parse(localStorage.getItem(key));
        const plId = key.replace("playlist_", "");

        const div = document.createElement("div");
        div.className = "playlist-option";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `chk-${plId}`;

        // Check if track is already in playlist
        const isInPlaylist = pl.tracks.some((t) => t.id === track.id);
        checkbox.checked = isInPlaylist;

        checkbox.onchange = (e) => {
          addToPlaylist(plId, track);
        };

        const label = document.createElement("label");
        label.htmlFor = `chk-${plId}`;
        label.textContent = pl.title;

        div.appendChild(checkbox);
        div.appendChild(label);

        div.onclick = (e) => {
          if (e.target !== checkbox && e.target !== label) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event("change"));
          }
        };

        list.appendChild(div);
      } catch (e) {
        console.error("Error parsing playlist", key, e);
      }
    }
  }
}

function closePlaylistModal() {
  document.getElementById("playlistModal").classList.add("hidden");
}

function createNewPlaylistFromModal() {
  const name = prompt("Playlist Name:");
  if (name) {
    createPlaylist(crypto.randomUUID(), name);
    openAddToPlaylistModal();
  }
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

  el.querySelector("h2").onclick = () => {
    const pinned = JSON.parse(localStorage.getItem("pinned")) || [];
    const item = ["artist", [id, name, pic]];

    // Check if already pinned
    const index = pinned.findIndex(
      ([type, data]) => type === "artist" && data[0] === id,
    );

    if (index !== -1) {
      // Remove if already pinned
      pinned.splice(index, 1);
    } else {
      // Add if not pinned
      pinned.push(item);
    }

    localStorage.setItem("pinned", JSON.stringify(pinned));
    loadPlaylists();
  };

  const content = document.getElementById("artistContent");

  const [primaryResponse, contentResponse] = await Promise.all([
    fetch(`${API}/artist/%3Fid=${id}`),
    fetch(`${API}/artist/%3Ff=${id}&skip_tracks=true`),
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
        fetch(`${API}/album/%3Fid=${t.album.id}`)
          .then((r) => r.json())
          .then((data) => {
            const fullTrack = data?.data?.items.find(
              (item) => item.item.id === t.id,
            )?.item;
            if (fullTrack) {
              favoriteTrack(fullTrack);
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
        al.cover ? `${IMG}${al.cover.replaceAll("-", "/")}/320x320.jpg` : "",
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
      date.setDate(date.getDate() + 1);
      dateStr = date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (e) {}
  }

  el.innerHTML = `
  <img src="${IMG}${al.cover.replaceAll("-", "/")}/320x320.jpg">
  <div style="display: flex; align-items: center; gap: 10px;">
    <h2 id="playlistTitle" style="cursor: ${al.type === "PLAYLIST" ? "pointer" : "default"}">${al.title}</h2>
  </div>
  <h3>${al.artists[0].name}${dateStr ? " • " + dateStr : ""}</h3>
  <span id="albumInfo">${al.numberOfTracks} songs • ${formatTime(al.duration)}${
    al.copyright ? " • " + al.copyright : ""
  }</span>
  <div style="margin-top: 20px;">
    <button class="album-action" id="playAll">PLAY</button>
    <button class="album-action secondary" id="shufflePlay">SHUFFLE</button>
    <button class="album-action secondary" id="deletePlaylist" style="display: none;">Delete Playlist</button>
    <button class="album-action secondary" id="pinAlbum" style="display: none;">Pin Album</button>
  </div>
  <div id="albumTracks"></div>
  `;
  let tracks = [];
  if (al.artists[0].id && al.artists[0].name && al.artists[0].picture) {
    el.querySelector("h3").onclick = () => {
      openArtist(al.artists[0].id, al.artists[0].name, al.artists[0].picture);
    };
    el.querySelector("h3").classList.add("clickable");
  }
  if (al.type == "PLAYLIST") {
    // Custom Playlist: use stored tracks
    tracks = al.playlistTracks.map((t) => ({ item: t }));

    const titleEl = document.getElementById("playlistTitle");
    const deleteBtn = document.getElementById("deletePlaylist");
    deleteBtn.style.display = "inline-block";

    // Add hover effect to edit title
    titleEl.style.outline = "none";
    titleEl.addEventListener("mouseenter", () => {
      titleEl.style.outline = "2px solid var(--main-color)";
      titleEl.style.padding = "5px 10px";
      titleEl.style.borderRadius = "5px";
    });
    titleEl.addEventListener("mouseleave", () => {
      if (document.activeElement !== titleEl) {
        titleEl.style.outline = "none";
        titleEl.style.padding = "0";
      }
    });

    // Click to edit title
    titleEl.addEventListener("click", () => {
      titleEl.contentEditable = true;
      titleEl.focus();

      const saveTitle = () => {
        titleEl.contentEditable = false;
        titleEl.style.outline = "none";
        titleEl.style.padding = "0";
        const newTitle = titleEl.textContent.trim();
        if (newTitle) {
          // Update localStorage
          let pl = JSON.parse(
            localStorage.getItem(`playlist_${al.id}`) || "null",
          );
          if (pl) {
            pl.title = newTitle;
            localStorage.setItem(`playlist_${al.id}`, JSON.stringify(pl));
            showToast(`Playlist renamed to "${newTitle}"`);
            // Reload playlists in sidebar
            loadPlaylists();
          }
        }
      };

      titleEl.addEventListener("blur", saveTitle, { once: true });
      titleEl.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            saveTitle();
          }
        },
        { once: true },
      );
    });

    const grid = document.createElement("div");
    grid.className = "playlist-cover";

    tracks.slice(0, 4).forEach((t) => {
      const img = document.createElement("img");
      img.src = `${IMG}${t.item.album.cover.replaceAll("-", "/")}/160x160.jpg`;
      Object.assign(img.style, {
        width: "100%",
        height: "100%",
        objectFit: "cover",
      });
      grid.appendChild(img);
    });

    el.querySelector("img").replaceWith(grid);

    // Delete playlist
    deleteBtn.onclick = () => {
      if (confirm(`Are you sure you want to delete "${al.title}"?`)) {
        deletePlaylist(al.id);
        showToast(`Deleted playlist "${al.title}"`);
        loadPlaylists();
        showView("search");
      }
    };
  } else {
    // Regular album: fetch from API
    const data = await fetch(`${API}/album/%3Fid=${al.id}`).then((r) =>
      r.json(),
    );
    tracks = data?.data?.items || [];
    const pinEl = document.getElementById("pinAlbum");
    pinEl.style.display = "inline-block";

    pinEl.addEventListener("click", () => {
      const pinned = JSON.parse(localStorage.getItem("pinned")) || [];
      const item = ["album", al]; // al is your album data

      // Check if album is already pinned
      const index = pinned.findIndex(
        ([type, data]) => type === "album" && data.id === al.id,
      );

      if (index !== -1) {
        // Remove if already pinned
        pinned.splice(index, 1);
      } else {
        // Add if not pinned
        pinned.push(item);
      }

      localStorage.setItem("pinned", JSON.stringify(pinned));
      loadPlaylists();
    });
  }

  tracks.forEach((t) => {
    const d = document.createElement("div");
    d.className = "song-row";
    d.innerHTML = `
    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${
      t.item.title
    }</span>
    ${t.item.explicit ? '<img src="e.svg">' : ""}
    <span class="right">${t.item.key ? `${t.item.key} ` : ""}${t.item.bpm ? `${t.item.bpm} BPM ` : ""}${formatTime(t.item.duration)}</span>`;
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
  const barWidth = (canvas.width / data.length) * 1.15;
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
  totalTimeEl.textContent =
    "-" + formatTime(audio.duration - audio.currentTime);

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
seekBar.addEventListener("mousemove", (e) => {
  const rect = seekBar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  timeTooltip.style.left = pct * 100 + "%";
  if (audio.duration) {
    timeTooltip.textContent = formatTime(pct * audio.duration);
  }
});

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
  if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
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

  timeTooltip.textContent = formatTime(hoverTime);
  timeTooltip.style.left = pct * 100 + "%";
  timeTooltip.style.opacity = 1;
});

seekBar.addEventListener("mouseleave", () => {
  timeTooltip.style.opacity = 0;
});

// Auto update
audio.addEventListener("timeupdate", updateProgress);
audio.addEventListener("progress", updateProgress);
audio.addEventListener("loadedmetadata", updateProgress);
