import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveConfig } from "../src/config";
import {
  registerTurn,
  unregisterTurn,
  isDraining,
  getActiveTurnCount,
  trackStreamLifetime,
  startServer,
} from "../src/server";
import type { OcxConfig } from "../src/types";

describe("active turn tracking", () => {
  test("register/unregister tracks active turns", () => {
    const ac1 = new AbortController();
    const ac2 = new AbortController();
    const before = getActiveTurnCount();
    registerTurn(ac1);
    registerTurn(ac2);
    expect(getActiveTurnCount()).toBe(before + 2);
    unregisterTurn(ac1);
    expect(getActiveTurnCount()).toBe(before + 1);
    unregisterTurn(ac2);
    expect(getActiveTurnCount()).toBe(before);
  });

  test("isDraining() is false by default", () => {
    expect(isDraining()).toBe(false);
  });

  test("management stop refuses to interrupt active turns", async () => {
    const previousOpencodexHome = process.env.OPENCODEX_HOME;
    const dir = mkdtempSync(join(tmpdir(), "ocx-stop-busy-"));
    process.env.OPENCODEX_HOME = dir;
    saveConfig({
      port: 0,
      defaultProvider: "openai",
      providers: {
        openai: {
          adapter: "openai-responses",
          baseUrl: "https://chatgpt.com/backend-api/codex",
          authMode: "forward",
        },
      },
    } as OcxConfig);

    const server = startServer(0);
    const ac = new AbortController();
    const before = getActiveTurnCount();
    registerTurn(ac);
    try {
      const response = await fetch(new URL("/api/stop", server.url), { method: "POST" });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: "proxy_busy", activeTurns: before + 1 });

      const health = await fetch(new URL("/healthz", server.url));
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: "ok", activeTurns: before + 1, draining: false });
    } finally {
      unregisterTurn(ac);
      await server.stop(true);
      if (previousOpencodexHome === undefined) delete process.env.OPENCODEX_HOME;
      else process.env.OPENCODEX_HOME = previousOpencodexHome;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("trackStreamLifetime", () => {
  test("registers on start and unregisters on stream close", async () => {
    const enc = new TextEncoder();
    const chunks = [enc.encode("hello"), enc.encode("world")];
    let i = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i < chunks.length) controller.enqueue(chunks[i++]);
        else controller.close();
      },
    });
    const ac = new AbortController();
    const before = getActiveTurnCount();
    const tracked = trackStreamLifetime(source, ac);
    expect(getActiveTurnCount()).toBe(before + 1);

    const reader = tracked.getReader();
    const dec = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
    }
    expect(text).toBe("helloworld");
    expect(getActiveTurnCount()).toBe(before);
  });

  test("unregisters on cancel", async () => {
    const source = new ReadableStream<Uint8Array>({
      pull() {
        // never closes — simulate long stream
      },
    });
    const ac = new AbortController();
    const before = getActiveTurnCount();
    const tracked = trackStreamLifetime(source, ac);
    expect(getActiveTurnCount()).toBe(before + 1);

    await tracked.cancel("test cancel");
    expect(getActiveTurnCount()).toBe(before);
    expect(ac.signal.aborted).toBe(true);
  });
});
