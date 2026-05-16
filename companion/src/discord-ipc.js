"use strict";

/**
 * Discord IPC Client
 *
 * Connects to Discord's local named pipe (Windows: \\.\pipe\discord-ipc-N)
 * using the Rich Presence / RPC protocol to read voice channel state and
 * send mute/unmute commands.
 *
 * Requires a Discord Application ID — register one free at:
 * https://discord.com/developers/applications
 */

const net = require("net");
const { EventEmitter } = require("events");
const { v4: uuidv4 } = require("uuid");

// IPC opcodes
const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

/**
 * Encode a Discord IPC packet.
 * @param {number} op
 * @param {object} payload
 * @returns {Buffer}
 */
function encode(op, payload) {
  const data = JSON.stringify(payload);
  const len = Buffer.byteLength(data);
  const buf = Buffer.alloc(8 + len);
  buf.writeUInt32LE(op, 0);
  buf.writeUInt32LE(len, 4);
  buf.write(data, 8, "utf8");
  return buf;
}

/**
 * Parse one or more Discord IPC frames from a raw Buffer.
 * Discord may concatenate multiple frames in a single socket read.
 * @param {Buffer} buf
 * @returns {{ op: number, payload: object }[]}
 */
function decode(buf) {
  const frames = [];
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const op = buf.readUInt32LE(offset);
    const len = buf.readUInt32LE(offset + 4);
    if (offset + 8 + len > buf.length) break; // incomplete frame
    const json = buf.slice(offset + 8, offset + 8 + len).toString("utf8");
    try {
      frames.push({ op, payload: JSON.parse(json) });
    } catch {
      // Skip malformed frames
    }
    offset += 8 + len;
  }
  return frames;
}

class DiscordIPC extends EventEmitter {
  constructor({ clientId }) {
    super();
    if (!clientId) throw new Error("DiscordIPC requires a clientId (Discord Application ID)");
    this.clientId = clientId;
    this.socket = null;
    this.connected = false;
    this._pendingCmds = new Map(); // nonce -> { resolve, reject }
    this._readBuffer = Buffer.alloc(0);
    this._reconnectTimer = null;
    this._reconnectDelay = 5000;
  }

  /** Attempt to connect to Discord IPC pipe 0–9 */
  connect() {
    for (let i = 0; i <= 9; i++) {
      const pipePath = `\\\\?\\pipe\\discord-ipc-${i}`;
      const socket = net.createConnection(pipePath, () => this._onConnect(socket));
      socket.once("error", () => {
        if (i === 9) this._scheduleReconnect();
      });
      // Try the next pipe only if connection fails
      socket.once("connect", () => {
        // Stop trying further pipes
        this.socket = socket;
      });
    }
  }

  _onConnect(socket) {
    this.socket = socket;
    this.connected = true;
    this._readBuffer = Buffer.alloc(0);

    socket.on("data", (chunk) => this._onData(chunk));
    socket.on("error", (err) => this._onError(err));
    socket.on("close", () => this._onClose());

    // Step 1: Handshake
    socket.write(encode(OP.HANDSHAKE, { v: 1, client_id: this.clientId }));
  }

  _onData(chunk) {
    this._readBuffer = Buffer.concat([this._readBuffer, chunk]);
    const frames = decode(this._readBuffer);

    // Consume parsed bytes
    let consumed = 0;
    for (const frame of frames) {
      consumed += 8 + Buffer.byteLength(JSON.stringify(frame.payload));
    }
    this._readBuffer = this._readBuffer.slice(consumed);

    for (const { op, payload } of frames) {
      this._handleFrame(op, payload);
    }
  }

  _handleFrame(op, payload) {
    if (op === OP.PONG) return;

    if (op === OP.CLOSE) {
      this._onClose();
      return;
    }

    if (op !== OP.FRAME) return;

    const { cmd, evt, data, nonce } = payload;

    // Resolve pending commands
    if (nonce && this._pendingCmds.has(nonce)) {
      const { resolve } = this._pendingCmds.get(nonce);
      this._pendingCmds.delete(nonce);
      resolve(payload);
    }

    // Ready event after handshake — now authenticate
    if (evt === "READY") {
      this.emit("ready", data);
      this._authorize();
      return;
    }

    // After AUTHORIZE, AUTHENTICATE
    if (cmd === "AUTHORIZE") {
      // In local-only mode (no OAuth scope needed for basic RPC), we skip real auth.
      // For production, implement the full OAuth code exchange here.
      this._authenticate();
      return;
    }

    if (cmd === "AUTHENTICATE") {
      if (payload.evt === "ERROR") {
        this.emit("auth_error", payload.data);
        return;
      }
      this.emit("authenticated");
      this._subscribeToVoiceEvents();
      return;
    }

    // Dispatch events
    if (evt) {
      this.emit("dispatch", { cmd, evt, data });
    }
  }

  _authorize() {
    // Skip OAuth for Rich Presence only mode (no access token needed for
    // GET_SELECTED_VOICE_CHANNEL when the app is whitelisted or running locally).
    this._authenticate();
  }

  _authenticate() {
    // Send AUTHENTICATE with an empty access token — works for apps that only
    // use local RPC commands that don't require user-delegated scopes.
    // For commands that require scopes (like SET_VOICE_SETTINGS), the user must
    // grant them via the OAuth flow; see companion/README.md.
    this._sendCommand("AUTHENTICATE", { access_token: "" });
  }

  _subscribeToVoiceEvents() {
    // Subscribe to events we need
    this._sendSubscribe("VOICE_CHANNEL_SELECT");
    this._sendSubscribe("VOICE_STATE_CREATE");
    this._sendSubscribe("VOICE_STATE_UPDATE");
    this._sendSubscribe("VOICE_STATE_DELETE");
    this._sendSubscribe("SPEAKING_START");
    this._sendSubscribe("SPEAKING_STOP");
    this._fetchCurrentChannel();
  }

  async _fetchCurrentChannel() {
    try {
      const result = await this._sendCommand("GET_SELECTED_VOICE_CHANNEL", {});
      this.emit("voice_channel", result.data);
    } catch {
      // Not in a channel
      this.emit("voice_channel", null);
    }
  }

  _sendSubscribe(evt, args = {}) {
    const nonce = uuidv4();
    const payload = { cmd: "SUBSCRIBE", args, evt, nonce };
    this.socket.write(encode(OP.FRAME, payload));
  }

  _sendCommand(cmd, args) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.socket) {
        reject(new Error("Not connected"));
        return;
      }
      const nonce = uuidv4();
      this._pendingCmds.set(nonce, { resolve, reject });
      const payload = { cmd, args, nonce };
      this.socket.write(encode(OP.FRAME, payload));

      // Timeout pending commands after 5s
      setTimeout(() => {
        if (this._pendingCmds.has(nonce)) {
          this._pendingCmds.delete(nonce);
          reject(new Error(`Command ${cmd} timed out`));
        }
      }, 5000);
    });
  }

  /**
   * Toggle self-mute state.
   * Requires the rpc.voice.write OAuth scope.
   */
  async toggleMute(currentMuted) {
    return this._sendCommand("SET_VOICE_SETTINGS", {
      mute: !currentMuted,
    });
  }

  _onError(err) {
    this.emit("error", err);
    this._cleanup();
    this._scheduleReconnect();
  }

  _onClose() {
    this.connected = false;
    this.emit("disconnected");
    this._cleanup();
    this._scheduleReconnect();
  }

  _cleanup() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this._pendingCmds.clear();
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, this._reconnectDelay);
  }

  destroy() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._cleanup();
  }
}

module.exports = { DiscordIPC };
