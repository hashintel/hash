/**
 * @layerRoot ui.plugins
 * @role The plugin API: a manifest of contributions, a body that returns their providers, and the API the body receives
 *
 * A plugin is `definePetrinautPlugin(manifest, body)`. The manifest is plain
 * data Petrinaut reads before running any plugin code. The body is a hook:
 * Petrinaut calls it during render, under the document's providers and beside
 * the editor view, and it returns one provider per contribution the manifest
 * declares. After each commit Petrinaut publishes those providers to a store
 * the editor reads, so a plugin joining or leaving never remounts the view. A
 * plugin that requires another reads that plugin's services during the same
 * render. The body mounts afresh for each document the editor shows, and
 * unmounts when the user switches off the plugin or a plugin it requires.
 *
 * TypeScript checks that every declared contribution has its provider and
 * that the body uses only declared setting keys and dependency tokens.
 *
 * Name the body `use<Name>Plugin` so the React Compiler memoizes what it
 * derives, as it does for any hook.
 */

import type { PetrinautAiAssistant } from "../petrinaut";
import type {
  PetrinautFlagSpec,
  PetrinautPluginManifest,
  PetrinautSettingSpec,
  PetrinautSettingValue,
} from "./plugin-manifest";
import type { PluginTokenValue } from "./plugin-token";
import type { PetrinautDocHandle } from "@hashintel/petrinaut-core";
import type { ReactNode, Ref } from "react";

/** The document the editor shows, as the body receives it in `api.document`. */
export interface PetrinautPluginDocument {
  /** The document's id, equal to `handle.id`. */
  readonly id: string;
  /** The document's handle: `doc()` reads the net, `change()` edits it, `subscribe()` follows it. */
  readonly handle: PetrinautDocHandle;
}

/** A tab in the assistant window, shown after the chat tab. */
export interface PetrinautAssistantTab {
  /**
   * Identifies the tab among the window's tabs; keep it stable across renders.
   * Do not use `"chat"`, which the chat tab uses.
   */
  readonly id: string;
  /** Text shown on the tab, also its accessible name. */
  readonly label: string;
  /** Decorative content before the label, such as an icon; hidden from screen readers. */
  readonly mark?: ReactNode;
  /**
   * Stable ids of the activity the tab lists; ids that appear while the tab is hidden badge it.
   * The first list is the baseline and showing the tab clears the badge; `undefined` until the activity is known.
   */
  readonly activityIdentities?: readonly (number | string)[];
  /**
   * What the tab renders, under the editor's providers; it stays mounted while another tab shows.
   * If it throws, this tab goes blank and the chat and other tabs keep running.
   */
  readonly content: ReactNode;
}

/**
 * The assistant window's content, from a plugin whose manifest declares `assistant: { label }`.
 * Petrinaut renders the window, its header and the chat tab; the plugin configures the chat and adds tabs.
 */
export interface PetrinautAssistantProvider {
  /**
   * Configures Petrinaut's chat for this document; `null` until the plugin is ready.
   * While the shown assistant's chat is `null`, the editor hides the window and every AI entry point.
   */
  readonly chat: PetrinautAiAssistant | null;
  /** Tabs shown after the chat tab, before the tabs of plugins extending this assistant. */
  readonly tabs?: readonly PetrinautAssistantTab[];
}

/**
 * What a plugin whose manifest declares `assistant: { extends }` adds to that assistant.
 * Applied only while the extended assistant is the one the editor shows.
 */
export interface PetrinautAssistantExtension {
  /** Chat fields that override the extended assistant's own; a later plugin's override wins. */
  readonly chat?: Partial<PetrinautAiAssistant>;
  /** Tabs shown after the extended assistant's own tabs. */
  readonly tabs?: readonly PetrinautAssistantTab[];
}

/** What a declared button shows and does; its label, tooltip and place come from the manifest. */
export interface PetrinautPluginButtonProvider {
  /** The icon the button shows; the toolbar sets the button's size and variant. */
  readonly icon: ReactNode;
  /** Runs when the button is clicked, before `command`. */
  readonly onClick?: () => void;
  /** Id of a palette command to run on click, after `onClick`, such as one registered with `useCommand`. */
  readonly command?: string;
  /** Class names added to the button element. */
  readonly className?: string;
  /** Ref to the button element, e.g. to attach a third-party widget. */
  readonly ref?: Ref<HTMLButtonElement>;
}

/** The keys of an optional manifest record; `never` when it is absent. */
type Keys<T> = T extends object ? keyof T : never;

/**
 * What the body returns: one provider per contribution the manifest declares.
 * A declared button without a provider, or a provider for an undeclared one, is a type error.
 *
 * @typeParam M - The plugin's manifest type.
 */
export type PetrinautPluginProviders<M extends PetrinautPluginManifest> = {
  /**
   * UI the editor renders inside itself: overlays, dialogs and anything else with no declared place.
   * Rendered behind the plugin's own error boundary.
   */
  readonly root?: ReactNode;
  /**
   * `true` while `root` covers the editor, as a modal or a tour does.
   * While any plugin returns `true`, the editor holds back its empty-canvas assistant prompt.
   */
  readonly overlay?: boolean;
  readonly buttons?: never;
  readonly topBarItems?: never;
  readonly assistant?: never;
  readonly provides?: never;
} extends infer Base
  ? Omit<Base, "buttons" | "topBarItems" | "assistant" | "provides"> &
      (M["buttons"] extends object
        ? {
            /** The icon and action of each button the manifest declares, by the same key. */
            readonly buttons: {
              readonly [K in Keys<M["buttons"]>]: PetrinautPluginButtonProvider;
            };
          }
        : {
            /** Unused: declare `buttons` in the manifest to return their providers here. */
            readonly buttons?: undefined;
          }) &
      (M["topBarItems"] extends object
        ? {
            /**
             * The content of each top-bar item the manifest declares, by the same key.
             * Rendered after the plugin's buttons at the same place, each behind its own error boundary.
             */
            readonly topBarItems: {
              readonly [K in Keys<M["topBarItems"]>]: ReactNode;
            };
          }
        : {
            /** Unused: declare `topBarItems` in the manifest to return their content here. */
            readonly topBarItems?: undefined;
          }) &
      (M["assistant"] extends { readonly label: string }
        ? {
            /** The chat configuration and tabs of the assistant this plugin provides. */
            readonly assistant: PetrinautAssistantProvider;
          }
        : M["assistant"] extends { readonly extends: string }
          ? {
              /** The chat fields and tabs this plugin adds to the assistant it extends. */
              readonly assistant: PetrinautAssistantExtension;
            }
          : {
              /** Unused: declare `assistant` in the manifest to return a provider or extension here. */
              readonly assistant?: undefined;
            }) &
      (M["provides"] extends object
        ? {
            /**
             * The value of each service the manifest provides, by the same key.
             * Plugins requiring the token read it in `api.deps` during the same render.
             */
            readonly provides: {
              readonly [K in Keys<M["provides"]>]: PluginTokenValue<
                NonNullable<M["provides"]>[K]
              >;
            };
          }
        : {
            /** Unused: declare `provides` in the manifest to return service values here. */
            readonly provides?: undefined;
          })
  : never;

/** Reads and writes the values of the manifest's `settings`, typed by each spec. */
export interface PetrinautPluginSettingsApi<
  Specs extends Readonly<Record<string, PetrinautSettingSpec>>,
> {
  /** The setting's current value: the stored one, or the spec's default. */
  get<K extends keyof Specs>(key: K): PetrinautSettingValue<Specs[K]>;
  /**
   * Stores a new value and runs the body again with it.
   * Persisted per plugin in local storage when available; throws on a value the spec rejects.
   */
  set<K extends keyof Specs>(
    key: K,
    value: PetrinautSettingValue<Specs[K]>,
  ): void;
}

/** Reads and writes the manifest's `flags`, the switches in the Labs section of User settings. */
export interface PetrinautPluginFlagsApi<
  Specs extends Readonly<Record<string, PetrinautFlagSpec>>,
> {
  /** Whether the flag is on: the stored value, or the spec's default. */
  get<K extends keyof Specs>(key: K): boolean;
  /** Turns the flag on or off, persists it like a setting, and runs the body again. */
  set<K extends keyof Specs>(key: K, value: boolean): void;
}

/**
 * What the body receives, current for this render.
 * When a setting, flag, dependency or the shown assistant changes, the body runs again.
 *
 * @typeParam M - The plugin's manifest type.
 */
export interface PetrinautPluginApi<M extends PetrinautPluginManifest> {
  /** This plugin's id, as declared in the manifest. */
  readonly id: M["id"];
  /** The document the editor shows; the body mounts afresh for each document. */
  readonly document: PetrinautPluginDocument;
  /** The state of the assistant this plugin provides or extends. */
  readonly assistant: {
    /**
     * Whether the editor shows the assistant this plugin provides or extends.
     * `false` for a plugin whose manifest declares no `assistant`.
     */
    readonly isActive: boolean;
  };
  /** Reads and writes the manifest's `settings`. */
  readonly settings: PetrinautPluginSettingsApi<
    M["settings"] extends object ? M["settings"] : Record<never, never>
  >;
  /** Reads and writes the manifest's `flags`. */
  readonly flags: PetrinautPluginFlagsApi<
    M["flags"] extends object ? M["flags"] : Record<never, never>
  >;
  /** Reports failures to the host's error tracker. */
  readonly errors: {
    /**
     * Sends `error` to the host's error tracker, tagged with this plugin's id as `pluginId`.
     *
     * @param context - Where the failure came from and how to correlate it.
     */
    capture(
      error: unknown,
      context?: {
        /** Dotted origin of the failure, e.g. `brunch.stream`; defaults to `plugin.<id>`. */
        source?: string;
        /** Opaque ids and classifications to correlate the failure; never user or model content. */
        tags?: Readonly<Record<string, string | number | boolean>>;
      },
    ): void;
  };
  /**
   * The service each `requires` entry resolves to, by the same key.
   * An optional token resolves to `undefined` while no running plugin provides it.
   */
  readonly deps: {
    readonly [K in Keys<M["requires"]>]: PluginTokenValue<
      NonNullable<M["requires"]>[K]
    >;
  };
}

/** The providers of any plugin as Petrinaut reads them, every key optional and string-indexed. */
export interface PetrinautPluginProvidersErased {
  /** UI rendered inside the editor, behind the plugin's error boundary. */
  readonly root?: ReactNode;
  /** `true` while `root` covers the editor. */
  readonly overlay?: boolean;
  /** Button providers by manifest key. */
  readonly buttons?: Readonly<Record<string, PetrinautPluginButtonProvider>>;
  /** Top-bar item content by manifest key. */
  readonly topBarItems?: Readonly<Record<string, ReactNode>>;
  /** The assistant provider or extension, as the manifest's `assistant` declares. */
  readonly assistant?: PetrinautAssistantProvider | PetrinautAssistantExtension;
  /** Provided service values by manifest key. */
  readonly provides?: Readonly<Record<string, unknown>>;
}

/**
 * The body: a hook that receives the plugin's API and returns its providers for this render.
 * Name it `use<Name>Plugin` so the React Compiler memoizes it like any hook.
 *
 * @typeParam M - The plugin's manifest type, e.g. `typeof brunchManifest`.
 */
export type PetrinautPluginBody<M extends PetrinautPluginManifest> = (
  api: PetrinautPluginApi<M>,
) => PetrinautPluginProviders<M>;

/**
 * A defined plugin, ready to pass to `<Petrinaut plugins={…}>`.
 * Plugins of any manifest fit one `PetrinautPlugin[]`.
 *
 * @typeParam M - The plugin's manifest type.
 */
export interface PetrinautPlugin<
  M extends PetrinautPluginManifest = PetrinautPluginManifest,
> {
  /** What the plugin contributes, read before the body runs. */
  readonly manifest: M;
  /** The plugin's body; only Petrinaut calls it, with an API built from `manifest`. */
  readonly body: (api: never) => PetrinautPluginProvidersErased;
}

/**
 * Defines a plugin from its manifest and its body.
 * Keeps the manifest's keys literal, so they type the body's providers, settings and deps.
 *
 * @example
 * ```tsx
 * const useBrunchPlugin: PetrinautPluginBody<typeof brunchManifest> = (api) => ({
 *   assistant: {
 *     chat: brunchChat,
 *     tabs: [{ id: "log", label: "Log", content: <BrunchLog doc={api.document} /> }],
 *   },
 * });
 * export const brunchPlugin = definePetrinautPlugin(brunchManifest, useBrunchPlugin);
 * ```
 */
export const definePetrinautPlugin = <const M extends PetrinautPluginManifest>(
  manifest: M,
  body: PetrinautPluginBody<M>,
): PetrinautPlugin<M> => ({ manifest, body });
