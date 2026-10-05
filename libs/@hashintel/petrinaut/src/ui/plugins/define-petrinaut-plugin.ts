/**
 * @layerRoot ui.plugins
 * @role The plugin API: a manifest of contributions, a body that returns their providers, and the host API the body receives
 *
 * A plugin is `definePetrinautPlugin(manifest, body)`. The manifest is plain
 * data Petrinaut lists before running anything. The body is a hook: Petrinaut
 * calls it during render in a host component under the document's providers,
 * beside the editor view, so it may call hooks, and it returns one provider
 * object per contribution the manifest declared, as values for this render.
 * After each commit the host publishes those values to a store the editor
 * reads, so a plugin joining or leaving never remounts the view; a plugin
 * that requires another one reads that one's services during the same
 * render. The body mounts afresh for each document the editor shows, and
 * leaves when the user switches the plugin off.
 * The compiler checks that every declared contribution has its provider and
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

/** The document the editor shows, as a plugin sees it. */
export interface PetrinautPluginDocument {
  /** The handle id, which hosts use as the document id. */
  readonly id: string;
  readonly handle: PetrinautDocHandle;
}

/** One tab the assistant adds to the window beside its chat. */
export interface PetrinautAssistantTab {
  /** Stable within the plugin; Petrinaut keys the tab on it. */
  readonly id: string;
  readonly label: string;
  /** A small mark before the label, e.g. an icon. */
  readonly mark?: ReactNode;
  /**
   * Opaque, stable identities of the activity this tab shows. Petrinaut counts
   * the ones that appear after the first collection it sees and badges the tab
   * with them until the tab is shown. `undefined` while the activity is not
   * known yet, so nothing is counted.
   */
  readonly activityIdentities?: readonly (number | string)[];
  /** The tab's content, mounted inside the editor's providers. */
  readonly content: ReactNode;
}

/**
 * The assistant window's content, from the plugin whose manifest declares
 * `assistant: { label }`. Petrinaut renders the frame, header and tab strip;
 * the chat tab shows Petrinaut's chat kit configured by `chat`, and every
 * entry of `tabs` is a tab the plugin renders itself.
 *
 * `chat` is `null` until the plugin is ready for this document, which hides
 * the window and every AI entry point.
 */
export interface PetrinautAssistantProvider {
  readonly chat: PetrinautAiAssistant | null;
  readonly tabs?: readonly PetrinautAssistantTab[];
}

/**
 * What a plugin whose manifest declares `assistant: { extends }` adds to that
 * assistant: fields merged over its chat configuration, and tabs after its
 * own. Applied only while the extended assistant is the one shown.
 */
export interface PetrinautAssistantExtension {
  readonly chat?: Partial<PetrinautAiAssistant>;
  readonly tabs?: readonly PetrinautAssistantTab[];
}

/** The body's side of a declared button: what it shows and does. */
export interface PetrinautPluginButtonProvider {
  readonly icon: ReactNode;
  readonly onClick?: () => void;
  /** A registry command to execute on click, after `onClick`. */
  readonly command?: string;
  readonly className?: string;
  /** Reaches the button element, e.g. to attach a third-party widget. */
  readonly ref?: Ref<HTMLButtonElement>;
}

type Keys<T> = T extends object ? keyof T : never;

/**
 * What the body returns: a provider for every contribution the manifest
 * declares. Keys follow the manifest, so a declared button without a provider
 * or a provider for an undeclared button is a type error.
 */
export type PetrinautPluginProviders<M extends PetrinautPluginManifest> = {
  /**
   * Rendered inside the editor, beside its panels, behind the plugin's own
   * error boundary: overlays, dialogs and other UI with no declared place.
   */
  readonly root?: ReactNode;
  /**
   * Whether `root` currently covers the editor, as a modal or a tour does.
   * While any plugin says so, Petrinaut holds back its own prompts over the
   * canvas.
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
            readonly buttons: {
              readonly [K in Keys<M["buttons"]>]: PetrinautPluginButtonProvider;
            };
          }
        : { readonly buttons?: undefined }) &
      (M["topBarItems"] extends object
        ? {
            readonly topBarItems: {
              readonly [K in Keys<M["topBarItems"]>]: ReactNode;
            };
          }
        : { readonly topBarItems?: undefined }) &
      (M["assistant"] extends { readonly label: string }
        ? { readonly assistant: PetrinautAssistantProvider }
        : M["assistant"] extends { readonly extends: string }
          ? { readonly assistant: PetrinautAssistantExtension }
          : { readonly assistant?: undefined }) &
      (M["provides"] extends object
        ? {
            readonly provides: {
              readonly [K in Keys<M["provides"]>]: PluginTokenValue<
                NonNullable<M["provides"]>[K]
              >;
            };
          }
        : { readonly provides?: undefined })
  : never;

/** Typed access to the values of the manifest's `settings`. */
export interface PetrinautPluginSettingsApi<
  Specs extends Readonly<Record<string, PetrinautSettingSpec>>,
> {
  get<K extends keyof Specs>(key: K): PetrinautSettingValue<Specs[K]>;
  set<K extends keyof Specs>(
    key: K,
    value: PetrinautSettingValue<Specs[K]>,
  ): void;
}

/** Typed access to the manifest's `flags`. */
export interface PetrinautPluginFlagsApi<
  Specs extends Readonly<Record<string, PetrinautFlagSpec>>,
> {
  get<K extends keyof Specs>(key: K): boolean;
  set<K extends keyof Specs>(key: K, value: boolean): void;
}

/**
 * What the body receives, as values for this render. Reading a setting or a
 * dependency is a plain property read; when one changes, the body runs again.
 */
export interface PetrinautPluginApi<M extends PetrinautPluginManifest> {
  readonly id: M["id"];
  /** The document the editor shows. */
  readonly document: PetrinautPluginDocument;
  readonly assistant: {
    /**
     * For a plugin that provides an assistant, whether the editor shows it;
     * for one that extends an assistant, whether the editor shows that one.
     * `false` for every other plugin.
     */
    readonly isActive: boolean;
  };
  readonly settings: PetrinautPluginSettingsApi<
    M["settings"] extends object ? M["settings"] : Record<never, never>
  >;
  readonly flags: PetrinautPluginFlagsApi<
    M["flags"] extends object ? M["flags"] : Record<never, never>
  >;
  /** Reports a failure to the host's error tracker, attributed to this plugin. */
  readonly errors: {
    capture(
      error: unknown,
      context?: {
        source?: string;
        tags?: Readonly<Record<string, string | number | boolean>>;
      },
    ): void;
  };
  /** The services the manifest requires, typed by their tokens. */
  readonly deps: {
    readonly [K in Keys<M["requires"]>]: PluginTokenValue<
      NonNullable<M["requires"]>[K]
    >;
  };
}

/**
 * The providers of a plugin whose manifest type is no longer known, as
 * Petrinaut reads them. Every key is optional and string-indexed.
 */
export interface PetrinautPluginProvidersErased {
  readonly root?: ReactNode;
  readonly overlay?: boolean;
  readonly buttons?: Readonly<Record<string, PetrinautPluginButtonProvider>>;
  readonly topBarItems?: Readonly<Record<string, ReactNode>>;
  readonly assistant?: PetrinautAssistantProvider | PetrinautAssistantExtension;
  readonly provides?: Readonly<Record<string, unknown>>;
}

/** The body: a hook from the API to this render's providers. */
export type PetrinautPluginBody<M extends PetrinautPluginManifest> = (
  api: PetrinautPluginApi<M>,
) => PetrinautPluginProviders<M>;

/**
 * A defined plugin. The body is stored erased: only Petrinaut calls it, with
 * an api built from this manifest, so a plugin of any manifest fits a host's
 * `PetrinautPlugin[]`.
 */
export interface PetrinautPlugin<
  M extends PetrinautPluginManifest = PetrinautPluginManifest,
> {
  readonly manifest: M;
  readonly body: (api: never) => PetrinautPluginProvidersErased;
}

/**
 * Pairs a manifest with its body. `const` inference keeps the manifest's keys
 * literal, which is what types the body's providers, settings and deps.
 */
export const definePetrinautPlugin = <const M extends PetrinautPluginManifest>(
  manifest: M,
  body: PetrinautPluginBody<M>,
): PetrinautPlugin<M> => ({ manifest, body });
