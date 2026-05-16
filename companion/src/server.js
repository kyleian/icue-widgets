"use strict";

/**
 * HTTP server that exposes Discord voice state for the iCUE widget to poll.
 *
 * Endpoints:
 *   GET  /state        — current voice state (JSON)
 *   POST /mute/toggle  — toggle self-mute
 *   GET  /health       — liveness check
 */

const express = require("express");

/**
 * @param {{ getState: () => object, toggleMute: () => Promise<void> }} discordBridge
 * @returns {import('express').Application}
 */
function createServer(discordBridge) {
  const app = express();

  // Only allow requests from localhost to prevent external access
  app.use((req, res, next) => {
    const host = req.socket.remoteAddress;
    if (host !== "127.0.0.1" && host !== "::1" && host !== "::ffff:127.0.0.1") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });

  // CORS — allow iCUE's embedded browser (null origin for local file:// / qtwebengine contexts)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || origin === "null") {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  /** GET /health — liveness probe */
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  /** GET /state — current Discord voice state */
  app.get("/state", (_req, res) => {
    const state = discordBridge.getState();
    res.json(state);
  });

  /** POST /mute/toggle — toggle self-mute */
  app.post("/mute/toggle", async (_req, res) => {
    try {
      await discordBridge.toggleMute();
      res.json({ ok: true });
    } catch (err) {
      res.status(503).json({ error: err.message });
    }
  });

  return app;
}

module.exports = { createServer };
