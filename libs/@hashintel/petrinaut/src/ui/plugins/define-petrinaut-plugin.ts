/**
 * @layerRoot ui.plugins
 * @role The plugin API: a manifest, a hook that receives api and returns contributions, and the runtime that renders them
 *
 * `definePetrinautPlugin(manifest)` returns a definition. Calling the
 * definition with a hook, or with the contributions themselves, returns the
 * plugin `<Petrinaut plugins>` takes. The manifest is plain data Petrinaut
 * reads before running plugin code; the hook receives `api`, which holds what
 * the manifest declares, and returns the contributions it declares.
 */

import type { PetrinautSettingsSection } from "../../react/navigation";
import type { AccessApi, PluginAccess } from "./plugin-access";
import type { ReactNode, Ref } from "react";

/** Where the editor renders a plugin button. */
export type PluginButtonPlace =
  /** The left part of the top bar, after the menu button and before the title. */
  | "top-bar-start"
  /** The right end of the top bar, after the built-in buttons. */
  | "top-bar-end"
  /** The viewport controls at the bottom right of the canvas, below the built-in buttons. */
  | "viewport-controls";

/** Where the editor renders a top-bar item, after the plugin's buttons at the same place. */
type PluginTopBarPlace = "top-bar-start" | "top-bar-end";

/** The User settings section that shows a setting's row. */
export type PluginSettingSection = Exclude<PetrinautSettingsSection, "plugins">;

type SettingRow = {
  /** The row's title in User settings. */
  readonly label: string;
  /** A sentence under the label explaining what the setting changes. */
  readonly description?: string;
  /** The section that shows the row; `labs` rows carry the experimental marker. Defaults to `general`. */
  readonly section?: PluginSettingSection;
};

/**
 * A user setting: a switch or a choice among strings. The editor renders its
 * row and stores its value per plugin; a stored value the spec rejects reads
 * as the default.
 */
export type PetrinautSettingSpec =
  | (SettingRow & { readonly type: "boolean"; readonly default: boolean })
  | (SettingRow & {
      readonly type: "enum";
      readonly options: readonly string[];
      /** One of `options`. */
      readonly default: string;
    });

/** The value a setting holds: a `boolean`, or one of an enum's `options`. */
type PetrinautSettingValue<Spec> = Spec extends {
  readonly type: "enum";
  readonly options: readonly (infer Option)[];
}
  ? Option
  : boolean;

declare const serviceType: unique symbol;

/** A service a plugin offers other plugins, as a type: see {@link pluginService}. */
export interface PluginService<T> {
  readonly [serviceType]?: T;
}

/**
 * Declares, in a manifest's `provides`, the type of the service the hook
 * returns under `provides`. Other plugins and components read it with
 * `usePluginService`.
 */
export const pluginService = <T>(): PluginService<T> => ({});

/** What a plugin declares, as plain data Petrinaut reads before running the plugin. */
export interface PetrinautPluginManifest {
  /**
   * Stable, namespaced id, unique among the editor's plugins, e.g. `website.brunch`.
   * Stored settings and the user's switch in the Plugins section are keyed by it.
   */
  readonly id: string;
  /** The name in the Plugins section and above the plugin's setting rows. */
  readonly name: string;
  /** What the plugin does, shown when its row in the Plugins section opens. */
  readonly description?: string;
  /** Who maintains the plugin, shown beside its name. */
  readonly author?: string;
  /** The editor state the plugin reads (`"read"`) or also changes (`"write"`), per family. */
  readonly access?: PluginAccess;
  /** Rows in User settings, keyed by the name `api.settings` reads. */
  readonly settings?: Readonly<Record<string, PetrinautSettingSpec>>;
  /** Icon buttons; the hook returns each one's icon and action under the same key. */
  readonly buttons?: Readonly<
    Record<
      string,
      {
        /** The accessible name, and the tooltip unless `tooltip` is set. */
        readonly label: string;
        readonly place: PluginButtonPlace;
        readonly tooltip?: string;
      }
    >
  >;
  /** Content in the top bar; the hook returns each item's node under the same key. */
  readonly topBarItems?: Readonly<
    Record<string, { readonly place: PluginTopBarPlace }>
  >;
  /**
   * An assistant, named by `label` in the assistant selector, or `extends`:
   * the definition of the plugin whose assistant this one adds to. The hook
   * returns the assistant, or the extension, under `assistant`.
   */
  readonly assistant?:
    | { readonly label: string; readonly extends?: never }
    | { readonly extends: PluginDefinitionRef; readonly label?: never };
  /** The service the hook returns under `provides`, declared with `pluginService<T>()`. */
  readonly provides?: PluginService<unknown>;
}

/** Any plugin definition, whatever its manifest. */
export type PluginDefinitionRef = {
  readonly manifest: PetrinautPluginManifest;
};

/** A tab in the assistant window, shown after the chat tab. */
export interface PluginAssistantTab {
  /** Identifies the tab among the window's tabs; never `"chat"`, the chat tab's id. */
  readonly id: string;
  /** Text shown on the tab, also its accessible name. */
  readonly label: string;
  /** Decorative content before the label, such as an icon. */
  readonly mark?: ReactNode;
  /**
   * Stable ids of the activity the tab lists; ids that appear while the tab is
   * hidden badge it. The first list is the baseline; `undefined` until the
   * activity is known.
   */
  readonly activityIdentities?: readonly string[];
  /** What the tab renders; it stays mounted while another tab shows, and fails alone. */
  readonly content: ReactNode;
}

/**
 * A way to start the assistant besides typing, such as voice mode. The
 * empty-net prompt offers the first one; choosing it opens the window with
 * the start request `{ action: id }`.
 */
export interface PluginAssistantStartAction {
  readonly id: string;
  /** The button's accessible name and tooltip. */
  readonly label: string;
  readonly icon: ReactNode;
}

/** The assistant of a plugin whose manifest declares `assistant: { label }`. */
export interface PluginAssistant {
  /**
   * The whole assistant UI, which draws `PetrinautAssistantWindow` around its
   * transcript; rendered once per document while this assistant is shown.
   * `null` until ready: the editor then hides the window and every AI entry point.
   */
  readonly view: ReactNode | null;
  /** Tabs after the chat tab, before the tabs of the plugins extending this assistant. */
  readonly tabs?: readonly PluginAssistantTab[];
  readonly startActions?: readonly PluginAssistantStartAction[];
}

/**
 * What a plugin whose manifest declares `assistant: { extends }` adds to that
 * assistant while it is shown: tabs and start actions, after its own.
 */
export interface PluginAssistantExtension {
  readonly tabs?: readonly PluginAssistantTab[];
  readonly startActions?: readonly PluginAssistantStartAction[];
  readonly view?: never;
}

/** Reads and writes the manifest's settings, typed by each spec. */
interface PluginSettingsApi<Specs> {
  /** The latest stored value, or the spec's default. */
  get<K extends keyof Specs>(key: K): PetrinautSettingValue<Specs[K]>;
  /** Validates, stores and persists the value, then runs the hook again. Throws on a value the spec rejects. */
  set<K extends keyof Specs>(
    key: K,
    value: PetrinautSettingValue<Specs[K]>,
  ): void;
}

type AccessOf<M> = M extends { readonly access: infer A extends PluginAccess }
  ? A
  : Record<never, never>;

/**
 * What the hook receives: `errors` and `notifications`, plus a member for
 * each family in `access`, and `settings` and `assistant` when the manifest
 * declares them. Undeclared members are absent from the type and from the
 * object.
 */
export type PluginApi<
  D extends PluginDefinitionRef,
  M extends PetrinautPluginManifest = D["manifest"],
> = AccessApi<AccessOf<M>> &
  (M extends { readonly settings: infer Specs }
    ? { readonly settings: PluginSettingsApi<Specs> }
    : unknown) &
  (M extends { readonly assistant: object }
    ? {
        readonly assistant: {
          /** Whether the editor shows this plugin's assistant, or the one it extends. */
          readonly isActive: boolean;
        };
      }
    : unknown);

/** What a declared button shows and does; its label, tooltip and place come from the manifest. */
export interface PluginButton {
  /** The icon; the toolbar sets the button's size and variant. */
  readonly icon: ReactNode;
  /** Runs on click, before `command`. */
  readonly onClick?: () => void;
  /** Runs a registered command on click, so the palette lists the button's action with its shortcut. */
  readonly command?: string;
  /** Class names added to the button element. */
  readonly className?: string;
  /** The button element, e.g. to attach a third-party widget. */
  readonly ref?: Ref<HTMLButtonElement>;
}

interface ContributionTable<M extends PetrinautPluginManifest> {
  buttons: { readonly [K in keyof NonNullable<M["buttons"]>]: PluginButton };
  topBarItems: {
    readonly [K in keyof NonNullable<M["topBarItems"]>]: ReactNode;
  };
  assistant: M["assistant"] extends { readonly label: string }
    ? PluginAssistant
    : PluginAssistantExtension;
  provides: ServiceOf<M>;
}

/** The service a manifest's plugin provides, or `never`. */
export type ServiceOf<M> =
  M extends Readonly<{ provides: PluginService<infer T> }> ? T : never;

/** The manifest keys present in `M`, as opposed to optional and absent. */
type DeclaredKeys<M> = {
  [K in keyof M]-?: undefined extends M[K] ? never : K;
}[keyof M];

/**
 * What the hook returns. `root` and `overlay` are always allowed; every
 * contribution the manifest declares is required, and every other one is a
 * type error.
 */
export type PluginContributions<
  D extends PluginDefinitionRef,
  M extends PetrinautPluginManifest = D["manifest"],
> = {
  /** UI the editor renders inside itself, behind the plugin's error boundary: dialogs, overlays, tours. */
  readonly root?: ReactNode;
  /** `true` while `root` covers the editor; holds back the empty-canvas assistant prompt. */
  readonly overlay?: boolean;
} & {
  readonly [K in DeclaredKeys<M> &
    keyof ContributionTable<M>]: ContributionTable<M>[K];
} & {
  readonly [K in Exclude<keyof ContributionTable<M>, DeclaredKeys<M>>]?: never;
};

/**
 * The hook: receives `api` and returns the contributions. Name it
 * `use<Name>Plugin`, declare it at module scope and annotate it with this
 * type, never with `satisfies`, which the React Compiler skips.
 */
export type PluginHook<D extends PluginDefinitionRef> = (
  api: PluginApi<D>,
) => PluginContributions<D>;

/** The contributions of any plugin, as the editor reads them. */
export interface AnyPluginContributions {
  readonly root?: ReactNode;
  readonly overlay?: boolean;
  readonly buttons?: Readonly<Record<string, PluginButton>>;
  readonly topBarItems?: Readonly<Record<string, ReactNode>>;
  readonly assistant?: PluginAssistant | PluginAssistantExtension;
  readonly provides?: unknown;
}

/** A plugin, ready for `<Petrinaut plugins>`. Plugins of any manifest fit one array. */
export interface PetrinautPlugin<
  M extends PetrinautPluginManifest = PetrinautPluginManifest,
> {
  readonly manifest: M;
  /** Only Petrinaut calls it, with the `api` built from `manifest`. */
  readonly hook: (api: never) => AnyPluginContributions;
  /** New for each call of the definition, so a re-created plugin remounts and nothing else does. */
  readonly hostKey: string;
}

/**
 * Returns the plugin for a hook, or for contributions that need no `api`.
 * `manifest` is readable without running plugin code.
 */
export interface PetrinautPluginDefinition<M extends PetrinautPluginManifest> {
  (
    implementation:
      | PluginHook<{ manifest: M }>
      | PluginContributions<{ manifest: M }>,
  ): PetrinautPlugin<M>;
  readonly manifest: M;
}

let nextSerial = 0;

/**
 * Defines a plugin's manifest. Call the definition at module scope, with the
 * hook or with the contributions written inline; a call during render makes a
 * new plugin, which remounts on every render.
 *
 * @example
 * ```tsx
 * const createCounterPlugin = definePetrinautPlugin({
 *   id: "example.counter",
 *   name: "Counter",
 *   topBarItems: { counter: { place: "top-bar-end" } },
 * });
 *
 * const useCounterPlugin: PluginHook<typeof createCounterPlugin> = () => {
 *   const [count, setCount] = useState(0);
 *   return {
 *     topBarItems: { counter: <button onClick={() => setCount(count + 1)}>{count}</button> },
 *   };
 * };
 *
 * export const counterPlugin = createCounterPlugin(useCounterPlugin);
 * ```
 */
export const definePetrinautPlugin = <const M extends PetrinautPluginManifest>(
  manifest: M,
): PetrinautPluginDefinition<M> =>
  Object.assign(
    (
      implementation:
        | PluginHook<{ manifest: M }>
        | PluginContributions<{ manifest: M }>,
    ): PetrinautPlugin<M> => ({
      manifest,
      hook:
        typeof implementation === "function"
          ? implementation
          : () => implementation,
      hostKey: `${manifest.id}#${nextSerial++}`,
    }),
    { manifest },
  );
