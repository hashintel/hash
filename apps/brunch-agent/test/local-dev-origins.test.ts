import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import {
  defaultChatOrigin,
  defaultPanelOrigins,
  localChatListen,
  localPanelListen,
  petrinautLocalServer,
} from "../src/local-dev-origins.ts";

const readAppFile = (relativePath: string): string =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("dev listens on the chat origin the panel proxy already assumes", () => {
  expect(defaultChatOrigin).toBe("http://127.0.0.1:4321");
  expect(localChatListen).toEqual({
    host: "127.0.0.1",
    port: 4321,
    strictPort: true,
  });
  expect(readAppFile("vite.config.ts")).toContain("localChatListen");
});

test("petrinaut:dev listens on the panel origin chat CORS already assumes", () => {
  expect(defaultPanelOrigins).toEqual([
    "http://127.0.0.1:4915",
    "http://localhost:4915",
  ]);
  expect(localPanelListen).toEqual({
    host: "127.0.0.1",
    port: 4915,
    strictPort: true,
  });
  expect(petrinautLocalServer(defaultChatOrigin)).toEqual({
    ...localPanelListen,
    proxy: {
      "/api/chat": {
        target: defaultChatOrigin,
        changeOrigin: true,
      },
    },
  });
  expect(readAppFile("petrinaut-local.vite.config.ts")).toContain(
    "petrinautLocalServer",
  );
  expect(readAppFile("src/petrinaut-chat.ts")).toContain("defaultPanelOrigins");
});
