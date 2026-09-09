import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import { mergePetrinautPanelConfig } from "../petrinaut-local.vite.config.ts";
import {
  defaultChatOrigin,
  localChatListen,
  localPanelListen,
  petrinautLocalServer,
} from "../src/http/local-origins.ts";

const readAppFile = (relativePath: string): string =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

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
