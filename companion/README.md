# Discord Companion Server

The companion server runs locally on your PC and bridges Discord's local IPC with the iCUE widget via HTTP.

## How it works

```
Discord Desktop App
      │  (local named pipe: \\.\pipe\discord-ipc-0)
      ▼
companion/index.js (Node.js)
      │  (HTTP on localhost:7575)
      ▼
iCUE Widget (Chromium, fetches /state every 2s)
```

## Prerequisites

1. **Node.js 20+**
2. **Discord** running on the same machine
3. A **Discord Application ID** (free) — register at <https://discord.com/developers/applications>

### Setting up a Discord Application

1. Go to <https://discord.com/developers/applications> and click **New Application**
2. Give it a name (e.g. "iCUE Widget")
3. Copy the **Application ID** from the General Information page
4. Under **Rich Presence → Art Assets**, you can optionally add cover art

> You do **not** need to add a Bot or configure OAuth for basic voice channel reading.
> Mute/unmute commands require the `rpc.voice.write` RPC scope — the first time
> the companion connects, Discord will prompt the user to approve this.

## Setup

```sh
cd companion
npm install
```

Create a `.env` file (or set environment variables):

```env
DISCORD_CLIENT_ID=123456789012345678
COMPANION_PORT=7575
```

## Running

```sh
# Production
npm start

# Development (auto-restarts on file change)
npm run dev
```

The server will start on `http://127.0.0.1:7575` by default.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check — returns `{ ok: true }` |
| `GET` | `/state` | Current voice state (see schema below) |
| `POST` | `/mute/toggle` | Toggle self-mute in the current channel |

### `/state` response schema

```json
{
  "in_voice": true,
  "guild_name": "My Server",
  "channel_name": "General",
  "self_mute": false,
  "members": [
    {
      "user_id": "123456789",
      "username": "kyleian",
      "nick": "Kyle",
      "avatar_url": "https://cdn.discordapp.com/avatars/…",
      "mute": false,
      "self_mute": false,
      "deaf": false,
      "speaking": true
    }
  ]
}
```

When not in a voice channel: `{ "in_voice": false, … }`

## Security

- The HTTP server **only binds to `127.0.0.1`** and rejects all non-loopback connections.
- No credentials or tokens are stored; the companion uses Discord's local IPC directly.

## Tests

```sh
npm test
npm run test:coverage
```
