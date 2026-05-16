"use strict";

/**
 * Entry point for the iCUE Discord companion server.
 *
 * Environment variables:
 *   DISCORD_CLIENT_ID   — Required. Your Discord Application ID.
 *   COMPANION_PORT      — HTTP port to listen on (default: 7575).
 */

const { DiscordIPC } = require("./src/discord-ipc");
const { createServer } = require("./src/server");

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const PORT = parseInt(process.env.COMPANION_PORT || "7575", 10);

if (!CLIENT_ID) {
  console.error(
    "[companion] ERROR: DISCORD_CLIENT_ID environment variable is not set.\n" +
      "  Register a Discord application at https://discord.com/developers/applications\n" +
      "  then set DISCORD_CLIENT_ID=<your_app_id> before starting.",
  );
  process.exit(1);
}

/* ── Voice state ── */

/** @type {import('./src/discord-ipc').VoiceState} */
let voiceState = {
  in_voice: false,
  guild_name: null,
  channel_name: null,
  self_mute: false,
  members: [],
};

/* ── Discord IPC ── */

const discord = new DiscordIPC({ clientId: CLIENT_ID });

discord.on("ready", () => {
  console.log("[companion] Discord IPC ready");
});

discord.on("authenticated", () => {
  console.log("[companion] Discord authenticated — subscribing to voice events");
});

discord.on("auth_error", (data) => {
  console.warn("[companion] Discord auth error:", data);
});

discord.on("voice_channel", (channel) => {
  if (!channel) {
    voiceState = { in_voice: false, guild_name: null, channel_name: null, self_mute: false, members: [] };
    console.log("[companion] Not in a voice channel");
    return;
  }
  voiceState.in_voice = true;
  voiceState.channel_name = channel.name || null;
  voiceState.guild_name = channel.guild_name || null;
  voiceState.members = (channel.voice_states || []).map(mapMember);
  console.log(`[companion] In voice channel: ${channel.name}`);
});

discord.on("dispatch", ({ evt, data }) => {
  switch (evt) {
    case "VOICE_CHANNEL_SELECT":
      if (!data || !data.channel_id) {
        voiceState = { in_voice: false, guild_name: null, channel_name: null, self_mute: false, members: [] };
      }
      break;

    case "VOICE_STATE_CREATE":
      if (!voiceState.members.find((m) => m.user_id === data.user.id)) {
        voiceState.members.push(mapMember(data));
      }
      break;

    case "VOICE_STATE_UPDATE": {
      const idx = voiceState.members.findIndex((m) => m.user_id === data.user.id);
      const updated = mapMember(data);
      if (idx !== -1) {
        voiceState.members[idx] = updated;
      }
      // Track self-mute
      if (data.nick === undefined) {
        voiceState.self_mute = data.voice_state?.self_mute ?? voiceState.self_mute;
      }
      break;
    }

    case "VOICE_STATE_DELETE":
      voiceState.members = voiceState.members.filter((m) => m.user_id !== data.user.id);
      break;

    case "SPEAKING_START": {
      const member = voiceState.members.find((m) => m.user_id === data.user_id);
      if (member) member.speaking = true;
      break;
    }

    case "SPEAKING_STOP": {
      const member = voiceState.members.find((m) => m.user_id === data.user_id);
      if (member) member.speaking = false;
      break;
    }

    default:
      break;
  }
});

discord.on("disconnected", () => {
  voiceState = { in_voice: false, guild_name: null, channel_name: null, self_mute: false, members: [] };
  console.log("[companion] Discord disconnected — reconnecting…");
});

discord.on("error", (err) => {
  console.error("[companion] Discord IPC error:", err.message);
});

/** Map a Discord voice state object to our simplified member format */
function mapMember(vs) {
  const user = vs.user || {};
  return {
    user_id: user.id || null,
    username: user.username || user.global_name || "Unknown",
    nick: vs.nick || null,
    avatar_url: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`
      : null,
    mute: vs.voice_state?.mute ?? false,
    self_mute: vs.voice_state?.self_mute ?? false,
    deaf: vs.voice_state?.deaf ?? false,
    speaking: false,
  };
}

/* ── HTTP server bridge ── */

const bridge = {
  getState: () => ({ ...voiceState, members: [...voiceState.members] }),
  toggleMute: () => discord.toggleMute(voiceState.self_mute),
};

const app = createServer(bridge);

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[companion] HTTP server listening on http://127.0.0.1:${PORT}`);
  console.log("[companion] Connecting to Discord IPC…");
  discord.connect();
});

process.on("SIGINT", () => {
  discord.destroy();
  process.exit(0);
});
