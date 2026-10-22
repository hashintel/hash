/**
 * @layerRoot ui.plugins
 * @role The plugin API: a manifest, a hook that receives api and returns contributions, and the runtime that renders them
 *
 * `definePetrinautPlugin(manifest)` returns a definition. Calling the
 * definition with a hook, or with the contributions themselves, returns the
 * plugin `<Petrinaut plugins>` takes; `definePetrinautPlugin(manifest,
 * implementation)` returns it directly. The manifest is plain data Petrinaut
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
export type PluginTopBarPlace = "top-bar-start" | "top-bar-end";

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
export type PluginSettingSpec =
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

/**
 * The id a declared command registers under: the plugin's id, a dot, the key.
 * Command keys contain no dot and plugin ids never start with `petrinaut.`, so
 * the id names one command and never one of the editor's own.
 */
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

/**
 * A service a plugin offers other plugins, as a type: see {@link pluginService}.
 * Only `pluginService` makes one, so `provides: {}` is a type error.
 */
export interface PluginService<T> {
  readonly [serviceType]: T;
}

/**
 * Declares, in a manifest's `provides`, the type of the service the hook
 * returns under `provides`. Other plugins and components read it with
 * `usePluginService`.
 */
export const pluginService = <T>(): PluginService<T> =>
  // The property exists in the type only, to carry `T`.
  ({}) as PluginService<T>;

/** A button the plugin declares; its icon and action come from the hook under the same key. */
export interface PluginButtonSpec {
  /** The accessible name, and the tooltip unless `tooltip` is set. */
  readonly label: string;
  readonly place: PluginButtonPlace;
  readonly tooltip?: string;
}

/** A top-bar item the plugin declares; its node comes from the hook under the same key. */
export interface PluginTopBarItemSpec {
  readonly place: PluginTopBarPlace;
}

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
  /**
   * `true` for a plugin the host depends on, such as its own Save control:
   * its row in the Plugins section has no switch, so the user cannot switch
   * it off. A hook that throws still marks it failed.
   */
  readonly required?: true;
  /** The editor state the plugin reads (`"read"`) or also changes (`"write"`), per family. */
  readonly access?: PluginAccess;
  /** Rows in User settings, keyed by the name `api.settings` reads. */
  readonly settings?: Readonly<Record<string, PluginSettingSpec>>;
  /**
   * Palette commands; the hook returns what each one does under the same
   * key. A button runs one with `command: key`.
   */
  readonly commands?: Readonly<Record<string, PluginCommandSpec>>;
  /** Icon buttons; the hook returns each one's icon and action under the same key. */
  readonly buttons?: Readonly<Record<string, PluginButtonSpec>>;
  /** Content in the top bar; the hook returns each item's node under the same key. */
  readonly topBarItems?: Readonly<Record<string, PluginTopBarItemSpec>>;
  /**
   * A button on the notice that explains a blocked edit on a document the
   * host made read-only, such as one that saves an editable copy. The hook
   * returns what it does under `readOnlyAction`. The notice shows the action
   * of the first running plugin that declares one.
   */
  readonly readOnlyAction?: {
    /** The button's text. */
    readonly label: string;
  };
  /**
   * UI inside the editor: dialogs, overlays, tours. The hook returns it under
   * `root`, and may return `overlay` while it covers the editor.
   */
  readonly root?: true;
  /**
   * The AI assistant. The hook returns the assistant panel's content under
   * `assistant`. The editor shows the first running plugin that declares one.
   */
  readonly assistant?: true;
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

interface PluginButtonLook {
  /** The icon; the toolbar sets the button's size and variant. */
  readonly icon: ReactNode;
  /** Class names added to the button element. */
  readonly className?: string;
}

/**
 * What a declared button shows and does; its label, tooltip and place come
 * from the manifest. `CommandKey` is the keys of the plugin's commands. A
 * button has at least one of `onClick`, `command` and `ref`.
 */
export type PluginButton<CommandKey extends string = string> =
  PluginButtonLook &
    (
      | {
          /** Runs on click, before `command`. */
          readonly onClick: () => void;
          readonly command?: CommandKey;
          readonly ref?: Ref<HTMLButtonElement>;
        }
      | {
          readonly onClick?: () => void;
          /** Runs one of the plugin's commands on click, so the button and its palette entry are one action. */
          readonly command: CommandKey;
          readonly ref?: Ref<HTMLButtonElement>;
        }
      | {
          readonly onClick?: () => void;
          readonly command?: CommandKey;
          /** The button element, e.g. for a third-party widget that handles its clicks. */
          readonly ref: Ref<HTMLButtonElement>;
        }
    );

/** What the read-only notice's button does; its label comes from the manifest. */
export interface PluginReadOnlyAction {
  /** Runs on click; the notice then closes. */
  readonly run: () => void;
}

/**
 * A button the empty-net prompt shows in place of Send while its input is
 * empty, such as a Voice start. Pressing it opens the assistant panel, then
 * calls `run`.
 */
export interface PluginAssistantStartAction {
  /** The button's accessible name and tooltip. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly run: () => void;
}

/** The AI assistant a plugin provides. */
export interface PluginAssistant {
  /**
   * Everything inside the assistant panel below its title bar, such as the
   * transcript and the composer. It renders behind the plugin's error boundary
   * and remounts when another net opens. It fills the title bar with
   * `AssistantPanelTitle` and reads the panel's state with `useAssistantPanel`.
   * When the panel opens, its element marked `data-autofocus`, such as the
   * composer, takes focus; without one, the panel does.
   */
  readonly content: ReactNode;
  /**
   * Takes the message the user sends from the empty-net prompt, after the
   * editor opens the panel. The prompt shows only while it is set.
   */
  readonly onPrompt?: (text: string) => void;
  /** Another way to start from the empty-net prompt, offered while its input is empty. */
  readonly startAction?: PluginAssistantStartAction;
}

interface ContributionTable<M extends PetrinautPluginManifest> {
  /** Rendered inside the editor behind the plugin's error boundary; `null` while there is nothing to show. */
  root: ReactNode;
  assistant: PluginAssistant;
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
  readOnlyAction: PluginReadOnlyAction;
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
 * What the hook returns. Every contribution the manifest declares is
 * required, every other one is a type error, and `overlay` goes with a
 * declared `root`.
 */
export type PluginContributions<
  D extends PluginDefinitionRef,
  M extends PetrinautPluginManifest = D["manifest"],
> = {
  readonly [
    K in DeclaredKeys<M> & keyof ContributionTable<M>
  ]: ContributionTable<M>[K];
} & {
  readonly [K in Exclude<keyof ContributionTable<M>, DeclaredKeys<M>>]?: never;
} & (M extends { readonly root: true }
    ? {
        /** `true` while `root` covers the editor; holds back the empty-canvas assistant prompt. */
        readonly overlay?: boolean;
      }
    : { readonly overlay?: never });

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
  readonly assistant?: PluginAssistant;
  readonly commands?: Readonly<Record<string, PluginCommand>>;
  readonly buttons?: Readonly<Record<string, PluginButton>>;
  readonly topBarItems?: Readonly<Record<string, ReactNode>>;
  readonly readOnlyAction?: PluginReadOnlyAction;
  readonly provides?: unknown;
}

/**
 * Keys the part of a plugin only Petrinaut reads. The package does not export
 * it, so a plugin comes from `definePetrinautPlugin` and its manifest checks.
 */
export const pluginRuntime: unique symbol = Symbol("petrinaut.pluginRuntime");

/** What Petrinaut runs for a plugin. */
export interface PluginRuntime {
  /** Called with the `api` built from the manifest. */
  readonly hook: (api: never) => AnyPluginContributions;
  /** New for each plugin created, so a re-created plugin remounts and nothing else does. */
  readonly hostKey: string;
}

/** A plugin, ready for `<Petrinaut plugins>`. Plugins of any manifest fit one array. */
export interface PetrinautPlugin<
  M extends PetrinautPluginManifest = PetrinautPluginManifest,
> {
  readonly manifest: M;
  readonly [pluginRuntime]: PluginRuntime;
}

/** What a definition takes: the hook, or contributions that need no `api`. */
export type PluginImplementation<M extends PetrinautPluginManifest> =
  | PluginHook<{ manifest: M }>
  | PluginContributions<{ manifest: M }>;

/**
 * Returns the plugin for a hook, or for contributions that need no `api`.
 * `manifest` is readable without running plugin code.
 */
export interface PetrinautPluginDefinition<M extends PetrinautPluginManifest> {
  (implementation: PluginImplementation<M>): PetrinautPlugin<M>;
  readonly manifest: M;
}

/** Ids that would let a plugin's commands replace the editor's own. */
type ReservedPluginId = "petrinaut" | `petrinaut.${string}`;

/** `never` for every key of `T` outside `Known`. */
type RejectUnknownKeys<T, Known extends PropertyKey> = {
  readonly [K in Exclude<keyof T, Known>]: never;
};

/** Every key of every member of a union; `keyof` gives only the shared ones. */
type KeysOfUnion<T> = T extends unknown ? keyof T : never;

type RejectUnknownEntryKeys<Specs, Known extends PropertyKey> = {
  readonly [K in keyof Specs]: RejectUnknownKeys<Specs[K], Known>;
};

/** `never` for an enum setting's `default` outside its `options`, or for empty `options`. */
type SettingValueChecks<Specs> = {
  readonly [K in keyof Specs]: Specs[K] extends {
    readonly type: "enum";
    readonly options: infer Options extends readonly string[];
    readonly default: infer Default;
  }
    ? Options extends readonly []
      ? { readonly options: never }
      : Default extends Options[number]
        ? unknown
        : { readonly default: never }
    : unknown;
};

type EntryChecks<
  M,
  Key extends keyof PetrinautPluginManifest,
  Known extends PropertyKey,
> = M extends { readonly [K in Key]: infer Specs }
  ? { readonly [K in Key]: RejectUnknownEntryKeys<Specs, Known> }
  : unknown;

/**
 * Checks a manifest gets on top of its type. TypeScript skips its
 * excess-property check on an inferred type parameter, so without them a
 * misspelt key, such as `comands` or a button's `tooltp`, compiles.
 */
type ManifestChecks<M> = RejectUnknownKeys<M, keyof PetrinautPluginManifest> &
  // A manifest typed as `PetrinautPluginManifest` holds `access` as optional,
  // which no literal does; its `api` and contributions would type as empty.
  ("access" extends keyof M
    ? undefined extends M["access" & keyof M]
      ? {
          readonly "Declare the manifest inline, or with `as const satisfies PetrinautPluginManifest`": never;
        }
      : unknown
    : unknown) &
  (M extends { readonly id: ReservedPluginId }
    ? { readonly id: never }
    : unknown) &
  (M extends { readonly commands: infer Specs }
    ? {
        readonly commands: {
          readonly [
            K in keyof Specs as K extends `${string}.${string}` ? K : never
          ]: never;
        };
      }
    : unknown) &
  (M extends { readonly access: infer A }
    ? { readonly access: RejectUnknownKeys<A, keyof PluginAccess> }
    : unknown) &
  EntryChecks<M, "settings", KeysOfUnion<PluginSettingSpec>> &
  (M extends { readonly settings: infer Specs }
    ? { readonly settings: SettingValueChecks<Specs> }
    : unknown) &
  EntryChecks<M, "commands", keyof PluginCommandSpec> &
  (M extends { readonly readOnlyAction: infer Spec }
    ? { readonly readOnlyAction: RejectUnknownKeys<Spec, "label"> }
    : unknown) &
  EntryChecks<M, "buttons", keyof PluginButtonSpec> &
  EntryChecks<M, "topBarItems", keyof PluginTopBarItemSpec>;

/** A plugin's implementation, whatever its manifest. */
type AnyImplementation = PluginRuntime["hook"] | AnyPluginContributions;

let nextSerial = 0;

/** Throws on what the manifest's type rejects, for manifests typed loosely. */
const assertValidManifest = ({
  id,
  commands,
  settings,
}: PetrinautPluginManifest) => {
  if (id === "petrinaut" || id.startsWith("petrinaut.")) {
    throw new Error(
      `Plugin id "${id}" is reserved. Ids starting "petrinaut." name the editor's own commands.`,
    );
  }
  for (const key of Object.keys(commands ?? {})) {
    if (key.includes(".")) {
      throw new Error(
        `Plugin "${id}" command "${key}" contains a dot. Command keys contain no dot.`,
      );
    }
  }
  for (const [key, spec] of Object.entries(settings ?? {})) {
    if (spec.type === "enum" && !spec.options.includes(spec.default)) {
      throw new Error(
        `Plugin "${id}" setting "${key}" defaults to "${spec.default}", which is not one of its options.`,
      );
    }
  }
};

const createPlugin = (
  manifest: PetrinautPluginManifest,
  implementation: AnyImplementation,
): PetrinautPlugin => ({
  manifest,
  [pluginRuntime]: {
    hook:
      typeof implementation === "function"
        ? implementation
        : () => implementation,
    hostKey: `${manifest.id}#${nextSerial++}`,
  },
});

/**
 * Defines a plugin's manifest and returns the definition. Call the definition
 * at module scope, with the hook or with the contributions written inline; a
 * call during render makes a new plugin, which remounts on every render.
 *
 * @example
 * ```tsx
 * const CounterPlugin = definePetrinautPlugin({
 *   id: "example.counter",
 *   name: "Counter",
 *   topBarItems: { counter: { place: "top-bar-end" } },
 * });
 *
 * const useCounterPlugin: PluginHook<typeof CounterPlugin> = () => {
 *   const [count, setCount] = useState(0);
 *   return {
 *     topBarItems: { counter: <button onClick={() => setCount(count + 1)}>{count}</button> },
 *   };
 * };
 *
 * export const counterPlugin = CounterPlugin(useCounterPlugin);
 * ```
 */
export function definePetrinautPlugin<const M extends PetrinautPluginManifest>(
  manifest: M & NoInfer<ManifestChecks<M>>,
): PetrinautPluginDefinition<M>;
/**
 * Returns the plugin for a manifest and its implementation. Call it at module
 * scope: a call during render makes a new plugin, which remounts on every
 * render. The implementation is the contributions, or a hook written inline
 * that only reads `api`. A hook with state stays a module-scope `useXPlugin`
 * passed to the definition.
 *
 * @example
 * ```tsx
 * export const helpPlugin = definePetrinautPlugin(
 *   {
 *     id: "example.help",
 *     name: "Help",
 *     buttons: { help: { label: "Open help", place: "top-bar-end" } },
 *   },
 *   { buttons: { help: { icon: <InfoIcon />, onClick: openHelp } } },
 * );
 * ```
 */
export function definePetrinautPlugin<const M extends PetrinautPluginManifest>(
  manifest: M & NoInfer<ManifestChecks<M>>,
  implementation:
    | NoInfer<PluginHook<{ manifest: M }>>
    | PluginContributions<{ manifest: M }>,
): PetrinautPlugin<M>;
export function definePetrinautPlugin(
  manifest: PetrinautPluginManifest,
  implementation?: AnyImplementation,
): PetrinautPlugin | PetrinautPluginDefinition<PetrinautPluginManifest> {
  assertValidManifest(manifest);

  return implementation === undefined
    ? Object.assign(
        (later: AnyImplementation) => createPlugin(manifest, later),
        { manifest },
      )
    : createPlugin(manifest, implementation);
}
