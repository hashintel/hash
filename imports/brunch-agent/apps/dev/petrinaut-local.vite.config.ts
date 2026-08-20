/**
 * Local FE-1436 panel launcher.
 *
 * Loads the real hash Petrinaut website config, removes only its incumbent
 * `/api/chat` dev handler, and sends that same-origin route to brunch's
 * committed application server. The real panel, wrappers, and editor stay untouched;
 * hash's tracked checkout stays clean.
 */

import { join, resolve } from 'node:path';
import { defineConfig, loadConfigFromFile, mergeConfig, type PluginOption } from 'vite';

const withoutIncumbentChatHandler = (plugins: readonly PluginOption[]): PluginOption[] =>
  plugins.filter((plugin) => {
    if (
      plugin === false ||
      plugin === null ||
      plugin === undefined ||
      Array.isArray(plugin) ||
      typeof plugin !== 'object' ||
      !('name' in plugin)
    ) {
      return true;
    }
    return plugin.name !== 'petrinaut-api-dev';
  });

export default defineConfig(async (environment) => {
  const websiteRoot = process.env.PETRINAUT_WEBSITE_ROOT;
  if (!websiteRoot) {
    throw new Error(
      'PETRINAUT_WEBSITE_ROOT must point at hash/apps/petrinaut-website for the real-panel run.',
    );
  }
  const root = resolve(websiteRoot);
  // Babel resolves the React compiler plugin from the launched project's cwd,
  // not from the imported config file. Match a native hash launch before the
  // plugin begins transforming the real panel source.
  process.chdir(root);
  const loaded = await loadConfigFromFile(environment, join(root, 'vite.config.ts'), root);
  if (!loaded) throw new Error(`Could not load Petrinaut's Vite config from ${root}.`);

  const chatOrigin = process.env.BRUNCH_CHAT_ORIGIN ?? 'http://127.0.0.1:4321';
  return mergeConfig(
    {
      ...loaded.config,
      plugins: withoutIncumbentChatHandler(loaded.config.plugins ?? []),
    },
    {
      root,
      server: {
        proxy: {
          '/api/chat': {
            target: chatOrigin,
            changeOrigin: true,
          },
        },
      },
    },
  );
});
