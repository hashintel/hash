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

const readRepoFile = (relativePath: string): string =>
  readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");

test("one documented root command starts the Brunch server and Petrinaut panel", () => {
  const rootPackage = JSON.parse(readRepoFile("package.json")) as {
    scripts: Record<string, string>;
  };

  expect(rootPackage.scripts["dev:brunch"]).toBe(
    "CARGO_TERM_PROGRESS_WHEN=never turbo run build --filter '@apps/petrinaut-website^...' && npm-run-all --parallel dev:brunch:server dev:brunch:panel",
  );
  expect(rootPackage.scripts["dev:brunch:server"]).toBe(
    "yarn workspace @apps/brunch-agent dev",
  );
  expect(rootPackage.scripts["dev:brunch:panel"]).toBe(
    'PETRINAUT_WEBSITE_ROOT="$PWD/apps/petrinaut-website" yarn workspace @apps/brunch-agent petrinaut:dev',
  );
  expect(readAppFile("README.md")).toContain("yarn dev:brunch");
});

test("dev listens on the chat origin the panel proxy already assumes", () => {
  expect(defaultChatOrigin).toBe("http://127.0.0.1:4321");
  expect(localChatListen).toEqual({
    host: "127.0.0.1",
    port: 4321,
    strictPort: true,
  });
  expect(readAppFile("vite.config.ts")).toContain("localChatListen");
});

test("petrinaut:dev proxies the mounted Flue conversation route", () => {
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
  expect(readAppFile("petrinaut-local.vite.config.ts")).toContain(
    "petrinautLocalServer",
  );
  expect(readAppFile("petrinaut-local.vite.config.ts")).toContain(
    'VITE_BRUNCH_CHAT_ENDPOINT ??= "/agents/chat"',
  );
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
