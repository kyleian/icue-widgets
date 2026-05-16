"use strict";

const { DiscordIPC } = require("../src/discord-ipc");

describe("DiscordIPC constructor", () => {
  it("throws if clientId is missing", () => {
    expect(() => new DiscordIPC({})).toThrow("clientId");
  });

  it("creates an instance with a clientId", () => {
    const ipc = new DiscordIPC({ clientId: "123456789" });
    expect(ipc.clientId).toBe("123456789");
    expect(ipc.connected).toBe(false);
  });
});

describe("DiscordIPC encoding / decoding", () => {
  // Access private helpers via module — re-export them for testing
  // Since they're not exported, we test through the public API behaviour
  it("destroy() cleans up without errors when not connected", () => {
    const ipc = new DiscordIPC({ clientId: "123" });
    expect(() => ipc.destroy()).not.toThrow();
    expect(ipc.connected).toBe(false);
  });
});
