/**
 * @layerRoot ui.plugins
 * @role The plugin API: what a plugin contributes, and the named places in the editor chrome that render those contributions
 *
 * A plugin is plain data. It names itself and lists contributions for the
 * places the editor exposes:
 *
 * | Place                | Contribution                                    |
 * | -------------------- | ----------------------------------------------- |
 * | `top-bar-start`      | buttons and custom items, before the net title  |
 * | `top-bar-end`        | buttons and custom items, at the trailing edge  |
 * | `viewport-controls`  | buttons under the canvas zoom controls          |
 * | `left-sidebar`       | collapsible sections (a `SubView`)              |
 * | `bottom-panel`       | tabs (a `SubView`)                              |
 * | edit views           | workspaces beside the Canvas in Edit mode       |
 * | settings `labs`      | groups after the built-in Labs settings          |
 * | command registry     | palette commands, static or from `component`    |
 *
 * `component` mounts once inside the editor's providers while the plugin is
 * installed, for stateful work: overlays, `useCommand` declarations,
 * subscriptions. Everything else is declared, so the editor can list it
 * without running plugin code.
 *
 * Every contribution that renders a component renders it behind its own
 * error boundary and Suspense boundary, so a lazy component is safe at any
 * place and one failure removes that contribution alone.
 */

import type { PetrinautSettingsSection } from "../../react/navigation";
import type { SubView } from "../components/sub-view/types";
import type { Command } from "@hashintel/petrinaut-core";
import type { ComponentType, ReactNode, Ref } from "react";

export type PetrinautPluginTopBarPlacement = "top-bar-start" | "top-bar-end";

export type PetrinautPluginButtonPlacement =
  | PetrinautPluginTopBarPlacement
  | "viewport-controls";

export type PetrinautPluginSubViewPlacement = "left-sidebar" | "bottom-panel";

/** The user settings sections a plugin can add groups to. */
export type PetrinautPluginSettingsSection = Extract<
  PetrinautSettingsSection,
  "labs"
>;

/**
 * A uniform icon button in one of the toolbars. The editor owns its size and
 * variant so plugin buttons sit beside the built-in ones without styling.
 */
export type PetrinautPluginButton = {
  /** Stable, namespaced id, e.g. `website.sentry-feedback.give-feedback`. */
  id: string;
  placement: PetrinautPluginButtonPlacement;
  /** Accessible name; also the tooltip unless `tooltip` is given. */
  label: string;
  icon: ReactNode;
  tooltip?: string;
  /** A registry command to execute on click, by id. Runs after `onClick`. */
  command?: string;
  onClick?: () => void;
  className?: string;
  /** Reaches the button element, e.g. to attach a third-party widget. */
  ref?: Ref<HTMLButtonElement>;
};

/** Arbitrary content in the top bar, rendered inline at its placement. */
export type PetrinautPluginTopBarItem = {
  id: string;
  placement: PetrinautPluginTopBarPlacement;
  component: ComponentType;
};

/**
 * A section or tab in one of the editor panels. The `SubView` contract is the
 * one the built-in panels use; the section state persists under its `id`, so
 * namespace it.
 */
export type PetrinautPluginSubView = SubView & {
  placement: PetrinautPluginSubViewPlacement;
};

/**
 * A workspace offered beside the Canvas in Edit mode. Its `id` is what the
 * navigation state and host URLs carry as the edit view. The Canvas /
 * Definitions selector floats over the top-left corner of every edit view,
 * so a view leaves that corner free.
 */
export type PetrinautPluginEditView = {
  id: string;
  /** The selector segment label. */
  label: string;
  component: ComponentType;
};

/**
 * A group of controls in the user settings dialog, after the section's
 * built-in groups. The dialog draws the group's frame and heading, as it does
 * for its own groups; the component renders the rows and keeps their state
 * with the host. The dialog's arrow-key flow walks its enabled controls.
 */
export type PetrinautPluginSettingsGroup = {
  /** Stable, namespaced id, e.g. `website.assistant-labs.settings`. */
  id: string;
  section: PetrinautPluginSettingsSection;
  /** The group heading, e.g. "Assistant". */
  title: string;
  component: ComponentType;
};

export type PetrinautPlugin = {
  /** Stable, namespaced id, e.g. `petrinaut.definitions-view`. */
  id: string;
  /** Human-readable name for diagnostics. */
  name?: string;
  buttons?: readonly PetrinautPluginButton[];
  topBarItems?: readonly PetrinautPluginTopBarItem[];
  /**
   * Registered into the ambient command registry while installed. `run` is
   * called as declared; to act on editor state, declare the command from
   * `component` with `useCommand` instead.
   */
  commands?: readonly Command[];
  subViews?: readonly PetrinautPluginSubView[];
  editViews?: readonly PetrinautPluginEditView[];
  settingsGroups?: readonly PetrinautPluginSettingsGroup[];
  /**
   * Mounted once per editor, inside its providers, while the plugin is
   * installed. It remounts when the editor switches to another document.
   * Renders nothing or its own overlays; a thrown error unmounts this
   * component alone and leaves the plugin's other contributions in place.
   */
  component?: ComponentType;
};

/** Identity helper that gives an inline plugin literal its contextual types. */
export const definePetrinautPlugin = (
  plugin: PetrinautPlugin,
): PetrinautPlugin => plugin;

/**
 * Edit view ids the editor owns. `canvas` is the built-in workspace, so a
 * plugin view with that id would hide it.
 */
const reservedEditViewIds: ReadonlySet<string> = new Set(["canvas"]);

/**
 * Contribution ids are React keys, command ids, URL values and persisted
 * settings keys, so two contributions at one place may not share one. Throws
 * with both plugin ids, like the plugin id check.
 */
const assertUniqueContributionIds = (
  plugins: readonly PetrinautPlugin[],
): void => {
  const ownersByPlace = new Map<string, Map<string, string>>();
  const claim = (place: string, id: string, pluginId: string) => {
    const owners = ownersByPlace.get(place) ?? new Map<string, string>();
    ownersByPlace.set(place, owners);
    const owner = owners.get(id);
    if (owner !== undefined) {
      throw new Error(
        `Petrinaut plugin "${pluginId}" contributes ${place} "${id}", which plugin "${owner}" already contributes. Give each contribution a namespaced id.`,
      );
    }
    owners.set(id, pluginId);
  };
  for (const plugin of plugins) {
    for (const button of plugin.buttons ?? []) {
      claim(button.placement, button.id, plugin.id);
    }
    for (const item of plugin.topBarItems ?? []) {
      claim(item.placement, item.id, plugin.id);
    }
    for (const command of plugin.commands ?? []) {
      claim("command", command.id, plugin.id);
    }
    for (const subView of plugin.subViews ?? []) {
      claim(subView.placement, subView.id, plugin.id);
    }
    for (const group of plugin.settingsGroups ?? []) {
      claim(`settings ${group.section}`, group.id, plugin.id);
    }
    for (const view of plugin.editViews ?? []) {
      if (reservedEditViewIds.has(view.id)) {
        throw new Error(
          `Petrinaut plugin "${plugin.id}" contributes edit view "${view.id}", which is a built-in edit view. Give the view a namespaced id.`,
        );
      }
      claim("edit view", view.id, plugin.id);
    }
  }
};

/**
 * The plugins one editor runs: the built-ins first, then the host's. Two
 * plugins with one id is a configuration error, so it throws rather than
 * letting the later one replace the earlier one silently.
 */
export const resolveInstalledPlugins = (
  builtInPlugins: readonly PetrinautPlugin[],
  hostPlugins: readonly PetrinautPlugin[],
): readonly PetrinautPlugin[] => {
  const installed = [...builtInPlugins, ...hostPlugins];
  const seen = new Set<string>();
  for (const plugin of installed) {
    if (seen.has(plugin.id)) {
      throw new Error(
        `Petrinaut plugin "${plugin.id}" is installed twice. Pass each plugin once, and pass \`builtInPlugins\` to replace a built-in rather than adding it again.`,
      );
    }
    seen.add(plugin.id);
  }
  assertUniqueContributionIds(installed);
  return installed;
};

export type PetrinautPluginToolbarItem =
  | { kind: "button"; pluginId: string; button: PetrinautPluginButton }
  | { kind: "custom"; pluginId: string; item: PetrinautPluginTopBarItem };

/**
 * Everything to render at one toolbar placement, in plugin order: a plugin's
 * buttons, then its custom items.
 */
export const selectPluginToolbarItems = (
  plugins: readonly PetrinautPlugin[],
  placement: PetrinautPluginButtonPlacement,
): PetrinautPluginToolbarItem[] =>
  plugins.flatMap((plugin) => [
    ...(plugin.buttons ?? [])
      .filter((button) => button.placement === placement)
      .map(
        (button): PetrinautPluginToolbarItem => ({
          kind: "button",
          pluginId: plugin.id,
          button,
        }),
      ),
    ...(plugin.topBarItems ?? [])
      .filter((item) => item.placement === placement)
      .map(
        (item): PetrinautPluginToolbarItem => ({
          kind: "custom",
          pluginId: plugin.id,
          item,
        }),
      ),
  ]);

/**
 * One panel's subviews, in plugin order. Each keeps the plugin's own object,
 * so a panel can key per-contribution state on it.
 */
export const selectPluginSubViews = (
  plugins: readonly PetrinautPlugin[],
  placement: PetrinautPluginSubViewPlacement,
): { pluginId: string; subView: PetrinautPluginSubView }[] =>
  plugins.flatMap((plugin) =>
    (plugin.subViews ?? [])
      .filter((subView) => subView.placement === placement)
      .map((subView) => ({ pluginId: plugin.id, subView })),
  );

export const selectPluginEditViews = (
  plugins: readonly PetrinautPlugin[],
): { pluginId: string; view: PetrinautPluginEditView }[] =>
  plugins.flatMap((plugin) =>
    (plugin.editViews ?? []).map((view) => ({ pluginId: plugin.id, view })),
  );

export const selectPluginSettingsGroups = (
  plugins: readonly PetrinautPlugin[],
  section: PetrinautSettingsSection,
): { pluginId: string; group: PetrinautPluginSettingsGroup }[] =>
  plugins.flatMap((plugin) =>
    (plugin.settingsGroups ?? [])
      .filter((group) => group.section === section)
      .map((group) => ({ pluginId: plugin.id, group })),
  );
