/**
 * Registers a running plugin's declared commands in the ambient command
 * registry, under `pluginCommandId(manifest.id, key)`, while its host is
 * mounted and each command's `when` holds. Declared shortcuts also work
 * without a registry.
 */

import { useEffect, useEffectEvent } from "react";

import { useCommand } from "../../react/commands/command-registry";
import { pluginCommandId } from "./define-petrinaut-plugin";

import type {
  AnyPluginContributions,
  PetrinautPluginManifest,
  PluginCommand,
  PluginCommandSpec,
} from "./define-petrinaut-plugin";

const matchesShortcut = (event: KeyboardEvent, shortcut: string) => {
  const parts = shortcut
    .toLowerCase()
    .split("+")
    .map((part) => part.trim());
  const key = parts.pop();
  const modifiers = new Set(parts);
  if (
    !key ||
    modifiers.size !== parts.length ||
    parts.some(
      (part) => !["mod", "ctrl", "meta", "alt", "shift"].includes(part),
    ) ||
    (modifiers.has("mod") && (modifiers.has("ctrl") || modifiers.has("meta")))
  )
    return false;

  const primaryMatches = modifiers.has("mod")
    ? event.metaKey !== event.ctrlKey
    : event.metaKey === modifiers.has("meta") &&
      event.ctrlKey === modifiers.has("ctrl");
  return (
    primaryMatches &&
    event.altKey === modifiers.has("alt") &&
    event.shiftKey === modifiers.has("shift") &&
    event.key.toLowerCase() === (key === "space" ? " " : key)
  );
};

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
  const active = command !== undefined && command.when !== false;
  const shortcut = spec.shortcut;
  useCommand(
    {
      id,
      label: spec.label,
      category: spec.category ?? category,
      keywords: spec.keywords,
      shortcut: spec.shortcut,
      run: () => command?.run(),
    },
    { when: active },
  );

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      !active ||
      !shortcut ||
      event.defaultPrevented ||
      event.isComposing ||
      event.repeat ||
      !matchesShortcut(event, shortcut)
    )
      return;
    if (
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable ||
        event.target.closest(
          'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
        ))
    )
      return;
    event.preventDefault();
    command.run();
  });
  useEffect(() => {
    if (!active || !shortcut) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, shortcut]);

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
