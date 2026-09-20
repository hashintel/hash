import { createContext, use, useEffect, type ReactNode } from "react";

import { useCommandRegistry } from "../../react/commands/command-registry";
import { PluginErrorBoundary } from "./installed-plugins/plugin-error-boundary";

import type { PetrinautPlugin } from "./plugin";
import type { Command } from "@hashintel/petrinaut-core";

const InstalledPluginsContext = createContext<readonly PetrinautPlugin[]>([]);

/**
 * The resolved plugin set of one editor or preview: built-ins and host
 * plugins in install order. The chrome reads its contributions from here.
 */
export const InstalledPluginsProvider = ({
  plugins,
  children,
}: {
  plugins: readonly PetrinautPlugin[];
  children: ReactNode;
}) => (
  <InstalledPluginsContext value={plugins}>{children}</InstalledPluginsContext>
);

export const useInstalledPlugins = (): readonly PetrinautPlugin[] =>
  use(InstalledPluginsContext);

/** Registers a plugin's declared commands while it is installed. */
const PluginCommands = ({ commands }: { commands: readonly Command[] }) => {
  const registry = useCommandRegistry();
  useEffect(() => {
    if (!registry) {
      return;
    }
    const disposers = commands.map((command) => registry.register(command));
    return () => {
      for (const dispose of disposers) {
        dispose();
      }
    };
  }, [registry, commands]);
  return null;
};

/**
 * Mounts the stateful side of every installed plugin: its declared commands
 * and its component, each behind its own error boundary. Rendered once,
 * inside the editor's providers.
 */
export const InstalledPlugins = () => {
  const plugins = useInstalledPlugins();
  return plugins.map((plugin) => {
    const PluginComponent = plugin.component;
    return (
      <PluginErrorBoundary key={plugin.id} pluginId={plugin.id}>
        {plugin.commands ? <PluginCommands commands={plugin.commands} /> : null}
        {PluginComponent ? <PluginComponent /> : null}
      </PluginErrorBoundary>
    );
  });
};
