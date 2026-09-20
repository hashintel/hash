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
 * | command registry     | palette commands, static or from `component`    |
 *
 * `component` mounts once inside the editor's providers while the plugin is
 * installed, for stateful work: overlays, `useCommand` declarations,
 * subscriptions. Everything else is declared, so the editor can list it
 * without running plugin code.
 */

import type { SubView } from "../components/sub-view/types";
import type { Command } from "@hashintel/petrinaut-core";
import type { ComponentType, ReactNode, Ref } from "react";

export type PetrinautPluginTopBarPlacement = "top-bar-start" | "top-bar-end";

export type PetrinautPluginButtonPlacement =
  | PetrinautPluginTopBarPlacement
  | "viewport-controls";

export type PetrinautPluginSubViewPlacement = "left-sidebar" | "bottom-panel";

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

export type PetrinautPlugin = {
  /** Stable, namespaced id, e.g. `petrinaut.definitions-view`. */
  id: string;
  /** Human-readable name for diagnostics. */
  name?: string;
  buttons?: readonly PetrinautPluginButton[];
  topBarItems?: readonly PetrinautPluginTopBarItem[];
  /** Registered into the ambient command registry while installed. */
  commands?: readonly Command[];
  subViews?: readonly PetrinautPluginSubView[];
  editViews?: readonly PetrinautPluginEditView[];
  /**
   * Mounted once per editor, inside its providers, while the plugin is
   * installed. Renders nothing or its own overlays; a thrown error unmounts
   * this plugin's component alone.
   */
  component?: ComponentType;
};

/** Identity helper that gives an inline plugin literal its contextual types. */
export const definePetrinautPlugin = (
  plugin: PetrinautPlugin,
): PetrinautPlugin => plugin;

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
  return installed;
};

export type PetrinautPluginToolbarItem =
  | { kind: "button"; button: PetrinautPluginButton }
  | { kind: "custom"; item: PetrinautPluginTopBarItem };

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
        (button): PetrinautPluginToolbarItem => ({ kind: "button", button }),
      ),
    ...(plugin.topBarItems ?? [])
      .filter((item) => item.placement === placement)
      .map((item): PetrinautPluginToolbarItem => ({ kind: "custom", item })),
  ]);

export const selectPluginSubViews = (
  plugins: readonly PetrinautPlugin[],
  placement: PetrinautPluginSubViewPlacement,
): SubView[] =>
  plugins.flatMap((plugin) =>
    (plugin.subViews ?? [])
      .filter((subView) => subView.placement === placement)
      .map(({ placement: _placement, ...subView }): SubView => subView),
  );

export const selectPluginEditViews = (
  plugins: readonly PetrinautPlugin[],
): PetrinautPluginEditView[] =>
  plugins.flatMap((plugin) => plugin.editViews ?? []);
