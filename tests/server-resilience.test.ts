import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { saveConfig } from "../src/config";
import { startServer } from "../src/server";
import type { OcxConfig } from "../src/types";

const previousOpencodexHome = process.env.OPENCODEX_HOME;
const TEST_DIR = join(import.meta.dir, ".tmp-server-resilience-test");

afterEach(() => {
  if (previousOpencodexHome === undefined) delete process.env.OPENCODEX_HOME;
  else process.env.OPENCODEX_HOME = previousOpencodexHome;
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe("server resilience", () => {
  test("data-plane handler errors return a proxy error without stopping the server", async () => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.env.OPENCODEX_HOME = TEST_DIR;

    saveConfig({
      port: 0,
      defaultProvider: "broken",
      providers: {
        broken: {
          adapter: "not-real",
          baseUrl: "https://example.invalid/v1",
          apiKey: "test-key",
          defaultModel: "broken-model",
        },
      },
    } as OcxConfig);

    const server = startServer(0);
    try {
      const response = await fetch(new URL("/v1/responses", server.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "broken-model", input: "hello", stream: false }),
      });
      expect(response.status).toBe(502);
      expect(await response.text()).toContain("Proxy request failed: Unknown adapter: not-real");

      const health = await fetch(new URL("/healthz", server.url));
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: "ok" });
    } finally {
      await server.stop(true);
    }
  });
});
