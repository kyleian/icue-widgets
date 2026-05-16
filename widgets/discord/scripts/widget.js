/**
 * Discord Voice iCUE Widget — Widget Script
 *
 * Polls the companion server for Discord voice state and renders it.
 * The companion server must be running at localhost:<proxyPort>.
 *
 * iCUE-injected globals used:
 *   proxyPort, accentColor, textColor, backgroundColor, showMembers
 */

/* ── State ── */

const DEFAULT_PORT = 7575;
const POLL_INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 1500;

let pollTimer = null;
let isMuted = false;

/* ── DOM references ── */

const screens = {
  disconnected: document.getElementById("disconnected"),
  connected: document.getElementById("connected"),
  error: document.getElementById("error"),
};

const els = {
  serverName: document.getElementById("server-name"),
  channelName: document.getElementById("channel-name"),
  membersList: document.getElementById("members-list"),
  muteBtn: document.getElementById("mute-btn"),
  muteLabel: document.getElementById("mute-label"),
};

/* ── Helpers ── */

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle("hidden", key !== name);
  }
}

function getPort() {
  // proxyPort is injected by iCUE at runtime; fall back to default
  const port = typeof proxyPort !== "undefined" ? parseInt(proxyPort, 10) : DEFAULT_PORT;
  return isNaN(port) ? DEFAULT_PORT : port;
}

function applyTheme() {
  const root = document.documentElement;
  if (typeof accentColor !== "undefined") root.style.setProperty("--accent", accentColor);
  if (typeof textColor !== "undefined") root.style.setProperty("--text", textColor);
  if (typeof backgroundColor !== "undefined") root.style.setProperty("--bg", backgroundColor);
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/* ── Rendering ── */

function renderMember(member) {
  const row = document.createElement("div");
  row.className = "member-row";
  if (member.speaking) row.classList.add("member-speaking");

  const avatar = document.createElement("div");
  avatar.className = "member-avatar";

  if (member.avatar_url) {
    const img = document.createElement("img");
    img.src = member.avatar_url;
    img.alt = member.username;
    img.onerror = () => {
      img.remove();
      avatar.textContent = getInitials(member.username);
    };
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitials(member.username);
  }

  const name = document.createElement("span");
  name.className = "member-name";
  name.textContent = member.nick || member.username || "Unknown";

  row.appendChild(avatar);
  row.appendChild(name);

  if (member.mute || member.self_mute) {
    const mutedIcon = document.createElement("span");
    mutedIcon.className = "member-muted";
    mutedIcon.textContent = "🔇";
    row.appendChild(mutedIcon);
  }

  return row;
}

function renderConnected(state) {
  els.serverName.textContent = state.guild_name || "Unknown Server";
  els.channelName.textContent = state.channel_name || "Unknown Channel";

  // Members list
  els.membersList.innerHTML = "";
  const showMembersEnabled = typeof showMembers === "undefined" || showMembers === true || showMembers === "true";
  if (showMembersEnabled && Array.isArray(state.members) && state.members.length > 0) {
    // Limit to 5 members to avoid overflow
    const visible = state.members.slice(0, 5);
    for (const member of visible) {
      els.membersList.appendChild(renderMember(member));
    }
    if (state.members.length > 5) {
      const more = document.createElement("div");
      more.className = "member-row";
      more.style.justifyContent = "center";
      more.textContent = `+${state.members.length - 5} more`;
      els.membersList.appendChild(more);
    }
  } else {
    els.membersList.style.display = "none";
  }

  // Mute button
  isMuted = state.self_mute === true;
  els.muteBtn.classList.toggle("is-muted", isMuted);
  els.muteLabel.textContent = isMuted ? "Unmute" : "Mute";
}

/* ── Data fetching ── */

async function fetchState() {
  const port = getPort();
  const url = `http://localhost:${port}/state`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      showScreen("error");
      return;
    }

    const data = await response.json();

    if (data.in_voice) {
      renderConnected(data);
      showScreen("connected");
    } else {
      showScreen("disconnected");
    }
  } catch (_err) {
    clearTimeout(timeout);
    showScreen("error");
  }
}

/* ── Mute toggle ── */

async function toggleMute() {
  const port = getPort();
  const url = `http://localhost:${port}/mute/toggle`;

  try {
    const response = await fetch(url, { method: "POST" });
    if (response.ok) {
      // Optimistic UI update before next poll
      isMuted = !isMuted;
      els.muteBtn.classList.toggle("is-muted", isMuted);
      els.muteLabel.textContent = isMuted ? "Unmute" : "Mute";
    }
  } catch (_err) {
    // Silently ignore — next poll will correct the UI
  }
}

/* ── Event binding ── */

els.muteBtn.addEventListener("click", toggleMute);

/* ── iCUE lifecycle ── */

function startPolling() {
  applyTheme();
  fetchState();
  pollTimer = setInterval(fetchState, POLL_INTERVAL_MS);
}

// Register iCUE event handlers
icueEvents = {
  onICUEInitialized: () => {
    applyTheme();
    startPolling();
  },
  onDataUpdated: () => {
    // Re-apply theme when user changes settings in iCUE panel
    applyTheme();
  },
};

// Handle case where iCUE already initialized before this script ran
if (typeof iCUE_initialized !== "undefined" && iCUE_initialized) {
  startPolling();
}
