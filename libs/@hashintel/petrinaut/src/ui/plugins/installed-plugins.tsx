import { createContext, Fragment, use, type ReactNode } from "react";

import { useCommand } from "../../react/commands/command-registry";
import { PluginContributionBoundary } from "./plugin-boundary";

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

/**
 * One declared command, registered like a `useCommand` declaration: it is
 * replaced only when its id, label, category, keywords or shortcut change, so
 * a plugin rebuilt with equal commands does not notify the palette.
 */
const PluginCommand = ({ command }: { command: Command }) => {
  useCommand(command);
  return null;
};

/**
 * Mounts the stateful side of every installed plugin: its declared commands
 * and its component, each behind its own boundary so that a failing component
 * does not take the plugin's commands with it. Rendered once per editor,
 * inside its providers.
 */
export const InstalledPlugins = () => {
  const plugins = useInstalledPlugins();
  return plugins.map((plugin) => {
    const PluginComponent = plugin.component;
    return (
      <Fragment key={plugin.id}>
        {plugin.commands !== undefined && plugin.commands.length > 0 ? (
          <PluginContributionBoundary
            pluginId={plugin.id}
            contributionId="commands"
            place="commands"
          >
            {plugin.commands.map((command) => (
              <PluginCommand key={command.id} command={command} />
            ))}
          </PluginContributionBoundary>
        ) : null}
        {PluginComponent ? (
          <PluginContributionBoundary
            pluginId={plugin.id}
            contributionId="component"
            place="component"
          >
            <PluginComponent />
          </PluginContributionBoundary>
        ) : null}
      </Fragment>
    );
  });
};
