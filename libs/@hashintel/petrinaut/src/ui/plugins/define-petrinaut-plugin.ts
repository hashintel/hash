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

/**
 * A command the plugin declares, as the palette shows it; what the command
 * does comes from the hook under the same key. Its registry id is
 * `<plugin id>.<key>`, see {@link pluginCommandId}.
 */
export interface PluginCommandSpec {
  /** What the palette shows, e.g. "Toggle the command palette". */
  readonly label: string;
  /** Palette grouping. Defaults to the plugin's `name`. */
  readonly category?: string;
  /** Extra search terms beyond the label. */
  readonly keywords?: readonly string[];
  /** The chord to display, e.g. `mod+k`. Display only: the plugin binds the keys. */
  readonly shortcut?: string;
}

/** The id a declared command registers under: the plugin's id, a dot, the key. */
export const pluginCommandId = (pluginId: string, key: string): string =>
  `${pluginId}.${key}`;

/**
 * The keys of the commands a manifest declares, or `never`. A conditional
 * type rather than `keyof NonNullable<M["commands"]>`: `keyof never` is every
 * key, which would let a plugin without commands name any `command`.
 */
type CommandKeyOf<M> = M extends {
  readonly commands: infer Specs extends object;
}
  ? keyof Specs & string
  : never;

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
  /**
   * Palette commands; the hook returns what each one does under the same
   * key. A button runs one with `command: key`.
   */
  readonly commands?: Readonly<Record<string, PluginCommandSpec>>;
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
  /** The service the hook returns under `provides`, declared with `pluginService<T>()`. */
  readonly provides?: PluginService<unknown>;
}

/** Any plugin definition, whatever its manifest. */
export type PluginDefinitionRef = {
  readonly manifest: PetrinautPluginManifest;
};

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
 * each family in `access` and `settings` when the manifest declares them.
 * Undeclared members are absent from the type and from the object.
 */
export type PluginApi<
  D extends PluginDefinitionRef,
  M extends PetrinautPluginManifest = D["manifest"],
> = AccessApi<AccessOf<M>> &
  (M extends { readonly settings: infer Specs }
    ? { readonly settings: PluginSettingsApi<Specs> }
    : unknown);

/** What a declared command does; its label, category, keywords and shortcut come from the manifest. */
export interface PluginCommand {
  readonly run: () => void;
  /** Registered while `true`, so the palette lists it; defaults to `true`. */
  readonly when?: boolean;
}

/**
 * What a declared button shows and does; its label, tooltip and place come
 * from the manifest. `CommandKey` is the keys of the plugin's commands.
 */
export interface PluginButton<CommandKey extends string = string> {
  /** The icon; the toolbar sets the button's size and variant. */
  readonly icon: ReactNode;
  /** Runs on click, before `command`. */
  readonly onClick?: () => void;
  /** Runs one of the plugin's commands on click, so the button and its palette entry are one action. */
  readonly command?: CommandKey;
  /** Class names added to the button element. */
  readonly className?: string;
  /** The button element, e.g. to attach a third-party widget. */
  readonly ref?: Ref<HTMLButtonElement>;
}

interface ContributionTable<M extends PetrinautPluginManifest> {
  commands: {
    readonly [K in keyof NonNullable<M["commands"]>]: PluginCommand;
  };
  buttons: {
    readonly [K in keyof NonNullable<M["buttons"]>]: PluginButton<
      CommandKeyOf<M>
    >;
  };
  topBarItems: {
    readonly [K in keyof NonNullable<M["topBarItems"]>]: ReactNode;
  };
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
  readonly commands?: Readonly<Record<string, PluginCommand>>;
  readonly buttons?: Readonly<Record<string, PluginButton>>;
  readonly topBarItems?: Readonly<Record<string, ReactNode>>;
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
