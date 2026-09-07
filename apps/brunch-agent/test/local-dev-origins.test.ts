import { readFileSync } from "node:fs";

import { afterEach, expect, test, vi } from "vitest";

import { mergePetrinautPanelConfig } from "../petrinaut-local.vite.config.ts";
import {
  defaultChatOrigin,
  localChatListen,
  localPanelListen,
  petrinautLocalServer,
} from "../src/http/local-origins.ts";

const readAppFile = (relativePath: string): string =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

/** The module reads the port variables once, as it is imported. */
const importWithPorts = async (chatPort: string, panelPort: string) => {
  vi.resetModules();
  vi.stubEnv("BRUNCH_CHAT_PORT", chatPort);
  vi.stubEnv("BRUNCH_PANEL_PORT", panelPort);
  return import("../src/http/local-origins.ts");
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("dev listens on the chat origin the panel proxy already assumes", () => {
  expect(defaultChatOrigin).toBe("http://127.0.0.1:4321");
  expect(localChatListen).toEqual({
    host: "127.0.0.1",
    port: 4321,
    strictPort: true,
  });
});

test("builds local panel configuration for the mounted Flue route", () => {
  expect(localPanelListen).toEqual({
    host: "127.0.0.1",
    port: 4915,
    strictPort: true,
  });
  expect(petrinautLocalServer(defaultChatOrigin)).toEqual({
    ...localPanelListen,
    proxy: {
      "/agents/chat": {
        target: defaultChatOrigin,
        changeOrigin: false,
      },
    },
  });
});

test("petrinaut:dev retains the website API handlers needed by Voice", () => {
  const config = mergePetrinautPanelConfig({
    chatOrigin: defaultChatOrigin,
    loadedConfig: {
      plugins: [{ name: "petrinaut-api-dev" }],
    },
    root: "/test/petrinaut-website",
  });

  expect(config.plugins).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "petrinaut-api-dev" }),
    ]),
  );
});

test("forwards the deployment CORS allowlist to local development", () => {
  const turboConfig = JSON.parse(readAppFile("turbo.json")) as {
    tasks: {
      dev: {
        passThroughEnv: string[];
      };
    };
  };

  expect(turboConfig.tasks.dev.passThroughEnv).toContain(
    "BRUNCH_CORS_ALLOWED_ORIGINS",
  );
});

test("an explicit port moves the listener and everything derived from it", async () => {
  const moved = await importWithPorts("4331", "4925");

  expect(moved.localChatListen.port).toBe(4331);
  expect(moved.defaultChatOrigin).toBe("http://127.0.0.1:4331");
  expect(moved.localPanelListen.port).toBe(4925);
  expect(moved.petrinautLocalServer(moved.defaultChatOrigin).port).toBe(4925);
});

test("a port that is not a usable number falls back to the default", async () => {
  const chatOnly = await importWithPorts("4331", "not-a-port");

  expect(chatOnly.localChatListen.port).toBe(4331);
  expect(chatOnly.localPanelListen.port).toBe(4915);
});

test("an overridden port keeps strictPort, so a clash is reported not absorbed", async () => {
  const moved = await importWithPorts("4331", "4925");

  expect(moved.localChatListen.strictPort).toBe(true);
  expect(moved.localPanelListen.strictPort).toBe(true);
});
