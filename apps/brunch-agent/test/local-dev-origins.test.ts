import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import petrinautLocalConfig from "../petrinaut-local.vite.config.ts";
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

test("petrinaut:dev retains the website API handlers needed by Voice", async () => {
  const previousCwd = process.cwd();
  const previousWebsiteRoot = process.env.PETRINAUT_WEBSITE_ROOT;
  const previousChatEndpoint = process.env.VITE_BRUNCH_CHAT_ENDPOINT;
  process.env.PETRINAUT_WEBSITE_ROOT = fileURLToPath(
    new URL("../../petrinaut-website", import.meta.url),
  );

  try {
    const config = await petrinautLocalConfig({
      command: "serve",
      isPreview: false,
      isSsrBuild: false,
      mode: "test",
    });

    expect(config.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "petrinaut-api-dev" }),
      ]),
    );
  } finally {
    process.chdir(previousCwd);
    if (previousWebsiteRoot === undefined) {
      delete process.env.PETRINAUT_WEBSITE_ROOT;
    } else {
      process.env.PETRINAUT_WEBSITE_ROOT = previousWebsiteRoot;
    }
    if (previousChatEndpoint === undefined) {
      delete process.env.VITE_BRUNCH_CHAT_ENDPOINT;
    } else {
      process.env.VITE_BRUNCH_CHAT_ENDPOINT = previousChatEndpoint;
    }
  }
});
