/**
 * Local FE-1436 panel launcher.
 *
 * Loads the real hash Petrinaut website config, including its stock API
 * handlers, and proxies Brunch's mounted Flue route to the committed
 * application server. The real panel, wrappers, and editor stay untouched;
 * hash's tracked checkout stays clean.
 */

import { join, resolve } from "node:path";

import { defineConfig, loadConfigFromFile, mergeConfig } from "vite";

import {
  defaultChatOrigin,
  petrinautLocalServer,
} from "./src/http/local-origins.ts";

export default defineConfig(async (environment) => {
  const websiteRoot = process.env.PETRINAUT_WEBSITE_ROOT;
  if (!websiteRoot) {
    throw new Error("PETRINAUT_WEBSITE_ROOT is required.");
  }
  const root = resolve(websiteRoot);
  process.env.VITE_BRUNCH_CHAT_ENDPOINT ??= "/agents/chat";
  // Babel resolves the React compiler plugin from the launched project's cwd,
  // not from the imported config file. Match a native hash launch before the
  // plugin begins transforming the real panel source.
  process.chdir(root);
  const loaded = await loadConfigFromFile(
    environment,
    join(root, "vite.config.ts"),
    root,
  );
  if (!loaded)
    throw new Error(`Could not load Petrinaut's Vite config from ${root}.`);

  const chatOrigin = process.env.BRUNCH_CHAT_ORIGIN ?? defaultChatOrigin;
  return mergeConfig(loaded.config, {
    root,
    server: petrinautLocalServer(chatOrigin),
  });
});
