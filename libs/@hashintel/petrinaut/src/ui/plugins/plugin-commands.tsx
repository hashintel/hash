/**
 * Registers a running plugin's declared commands in the ambient command
 * registry, under `pluginCommandId(manifest.id, key)`, while its host is
 * mounted and each command's `when` holds. A no-op without a registry.
 */

import { useCommand } from "../../react/commands/command-registry";
import { pluginCommandId } from "./define-petrinaut-plugin";

import type {
  AnyPluginContributions,
  PetrinautPluginManifest,
  PluginCommand,
  PluginCommandSpec,
} from "./define-petrinaut-plugin";

const PluginCommandRegistration = ({
  id,
  spec,
  category,
  command,
}: {
  id: string;
  spec: PluginCommandSpec;
  /** The plugin's name, the category a spec does not set. */
  category: string;
  /** What the hook returned for this key in its latest render, if anything. */
  command: PluginCommand | undefined;
}) => {
  useCommand(
    {
      id,
      label: spec.label,
      category: spec.category ?? category,
      keywords: spec.keywords,
      shortcut: spec.shortcut,
      run: () => command?.run(),
    },
    { when: command !== undefined && command.when !== false },
  );

  return null;
};

/** One registration per command the manifest declares, keyed by the command's key. */
export const PluginCommandRegistrations = ({
  manifest,
  commands,
}: {
  manifest: PetrinautPluginManifest;
  commands: AnyPluginContributions["commands"];
}) =>
  Object.entries(manifest.commands ?? {}).map(([key, spec]) => (
    <PluginCommandRegistration
      key={key}
      id={pluginCommandId(manifest.id, key)}
      spec={spec}
      category={manifest.name}
      command={commands?.[key]}
    />
  ));
