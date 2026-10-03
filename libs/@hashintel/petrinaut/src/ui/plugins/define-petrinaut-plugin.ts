/**
 * @layerRoot ui.plugins
 * @role The plugin API: a manifest of contributions, a body that returns their providers, and the host API the body receives
 *
 * A plugin is `definePetrinautPlugin(manifest, body)`. The manifest is plain
 * data Petrinaut lists before running anything; the body runs once per
 * `PetrinautPluginsProvider`, outliving documents, and returns one provider
 * object per contribution the manifest declared. The compiler checks that
 * every declared contribution has its provider and that the body uses only
 * declared setting keys and dependency tokens.
 */

import type { PetrinautAiAssistant } from "../petrinaut";
import type {
  PetrinautFlagSpec,
  PetrinautPluginManifest,
  PetrinautSettingSpec,
  PetrinautSettingValue,
} from "./plugin-manifest";
import type { PluginTokenValue } from "./plugin-token";
import type {
  PetrinautDocHandle,
  ReadableStore,
} from "@hashintel/petrinaut-core";
import type { ComponentType, ReactNode, Ref } from "react";

/** The document Petrinaut currently shows, as a plugin sees it. */
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
  /** Unseen updates, shown as a badge on the tab. */
  readonly attention?: number;
  /** The tab's content, mounted inside the editor's providers. */
  readonly render: ComponentType;
}

/**
 * The assistant window's content. Petrinaut renders the frame, header and
 * tab strip; the chat tab shows Petrinaut's chat kit configured by `chat`,
 * and every entry of `tabs` is a tab the plugin renders itself.
 *
 * `chat` is `null` until the plugin is ready for this document, which hides
 * the window and every AI entry point.
 */
export interface PetrinautAssistantProvider {
  readonly chat: ReadableStore<PetrinautAiAssistant | null>;
  readonly tabs?: ReadableStore<readonly PetrinautAssistantTab[]>;
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
   * Mounted once while the plugin is installed, above the editor, inside the
   * host's settings, command and error-tracker providers. It renders nothing
   * visible; it runs the plugin's hooks and publishes into its stores.
   */
  readonly root?: ComponentType;
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
              readonly [K in Keys<M["topBarItems"]>]: ComponentType;
            };
          }
        : { readonly topBarItems?: undefined }) &
      (M["assistant"] extends object
        ? { readonly assistant: PetrinautAssistantProvider }
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
  store<K extends keyof Specs>(
    key: K,
  ): ReadableStore<PetrinautSettingValue<Specs[K]>>;
}

/** Typed access to the manifest's `flags`. */
export interface PetrinautPluginFlagsApi<
  Specs extends Readonly<Record<string, PetrinautFlagSpec>>,
> {
  get<K extends keyof Specs>(key: K): boolean;
  set<K extends keyof Specs>(key: K, value: boolean): void;
  store<K extends keyof Specs>(key: K): ReadableStore<boolean>;
}

/** What Petrinaut tells a plugin about its own assistant and the window. */
export interface PetrinautPluginAssistantApi {
  /** Whether this plugin's assistant is the one the editor shows. */
  readonly isActive: ReadableStore<boolean>;
  readonly window: {
    readonly isOpen: ReadableStore<boolean>;
    /** The active tab id: `"chat"`, or one of the plugin's tab ids. */
    readonly activeTab: ReadableStore<string>;
  };
}

export interface PetrinautPluginApi<M extends PetrinautPluginManifest> {
  readonly id: M["id"];
  /** Aborted when the plugin is removed. Pass it to fetches and listeners. */
  readonly signal: AbortSignal;
  /** The document the editor shows; `null` between documents. */
  readonly document: ReadableStore<PetrinautPluginDocument | null>;
  readonly assistant: PetrinautPluginAssistantApi;
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
  /** The services the manifest requires, resolved and typed by their tokens. */
  readonly deps: {
    readonly [K in Keys<M["requires"]>]: PluginTokenValue<
      NonNullable<M["requires"]>[K]
    >;
  };
  /** Runs when the plugin is removed, after `signal` aborts. */
  defer(cleanup: () => void): void;
}

/**
 * The providers of a plugin whose manifest type is no longer known, as the
 * runtime and the chrome read them. Every key is optional and string-indexed.
 */
export interface PetrinautPluginProvidersErased {
  readonly root?: ComponentType;
  readonly buttons?: Readonly<Record<string, PetrinautPluginButtonProvider>>;
  readonly topBarItems?: Readonly<Record<string, ComponentType>>;
  readonly assistant?: PetrinautAssistantProvider;
  readonly provides?: Readonly<Record<string, unknown>>;
}

export type PetrinautPluginBody<M extends PetrinautPluginManifest> = (
  api: PetrinautPluginApi<M>,
) => PetrinautPluginProviders<M>;

/**
 * A defined plugin. The body is stored erased: only the runtime calls it, with
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
