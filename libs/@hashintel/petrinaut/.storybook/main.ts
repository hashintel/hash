import type { StorybookConfig } from "@storybook/react-vite";
import type { PluginOption } from "vite";

/**
 * The plugins of `vite.config.ts` that serve the library build alone: one
 * leaves React's runtime as a bare import for the host's bundler to resolve,
 * the others emit type declarations.
 */
const libraryOnlyPlugin =
  /^(?:builtin:esm-external-require$|rolldown-plugin-dts:)/;

const withoutLibraryOnlyPlugins = (plugins: PluginOption[]): PluginOption[] =>
  plugins
    .map((plugin) =>
      Array.isArray(plugin) ? withoutLibraryOnlyPlugins(plugin) : plugin,
    )
    .filter(
      (plugin) =>
        !(
          typeof plugin === "object" &&
          plugin !== null &&
          "name" in plugin &&
          libraryOnlyPlugin.test(plugin.name)
        ),
    );

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: "@storybook/react-vite",
  staticDirs: ["../public"],
  // No story shows a props table, and docgen parses every module for one.
  typescript: { reactDocgen: false },
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: withoutLibraryOnlyPlugins(viteConfig.plugins ?? []),
    // The library's `renderBuiltUrl` names a chunk by its file name alone,
    // which a page resolves against the wrong folder.
    experimental: undefined,
  }),
};

export default config;
