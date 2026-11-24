/**
 * Local FE-1436 panel launcher.
 *
 * Loads the real hash Petrinaut website config and proxies Brunch's mounted
 * Flue route to the committed application server. The real panel, API
 * handlers, wrappers, and editor stay untouched; hash's tracked checkout
 * stays clean.
 */

import { join, resolve } from "node:path";

import {
  defineConfig,
  loadConfigFromFile,
  mergeConfig,
  type UserConfig,
} from "vite";

import { brunchRoutes } from "@hashintel/brunch-agent";

import { brunchEnv } from "./src/env.ts";
import {
  defaultChatOrigin,
  petrinautLocalServer,
} from "./src/server/http/local-origins.ts";

/**
 * The Brunch variables the panel launcher reads. `turbo.json` forwards exactly
 * these to `petrinaut:dev`.
 */
export const petrinautPanelEnv = {
  chatOrigin: "BRUNCH_CHAT_ORIGIN",
  chatPort: brunchEnv.chatPort,
  panelPort: brunchEnv.panelPort,
  /**
   * The website reads it as a literal `import.meta.env` access, so that Vite
   * can replace it.
   */
  viteChatEndpoint: "VITE_BRUNCH_CHAT_ENDPOINT",
} as const;

interface PetrinautPanelConfigOptions {
  readonly chatOrigin: string;
  readonly loadedConfig: UserConfig;
  readonly root: string;
}

export const mergePetrinautPanelConfig = ({
  chatOrigin,
  loadedConfig,
  root,
}: PetrinautPanelConfigOptions): UserConfig =>
  mergeConfig(loadedConfig, {
    root,
    server: petrinautLocalServer(chatOrigin),
  });

export default defineConfig(async (environment) => {
  const websiteRoot = process.env.PETRINAUT_WEBSITE_ROOT;
  if (!websiteRoot) {
    throw new Error("PETRINAUT_WEBSITE_ROOT is required.");
  }
  const root = resolve(websiteRoot);
  process.env[petrinautPanelEnv.viteChatEndpoint] ??=
    `${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}`;
  process.env.VITE_PETRINAUT_DEFAULT_ASSISTANT ??= "brunch";
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

  const chatOrigin =
    process.env[petrinautPanelEnv.chatOrigin] ?? defaultChatOrigin;
  return mergePetrinautPanelConfig({
    chatOrigin,
    loadedConfig: loaded.config,
    root,
  });
});
