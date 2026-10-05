/**
 * The manifest: what a plugin contributes, as plain data.
 *
 * Petrinaut reads it before the plugin's body runs, so it can list the
 * buttons, settings rows and the assistant without executing plugin code.
 * Each contribution is keyed by a short id; Petrinaut prefixes it with the
 * plugin id where a global id is needed (a setting key, a command id).
 * Behaviour and components come from the body, typed by these keys.
 */

import type { PluginToken } from "./plugin-token";

export type PetrinautPluginButtonPlace =
  | "top-bar-start"
  | "top-bar-end"
  | "viewport-controls";

export type PetrinautPluginTopBarPlace = "top-bar-start" | "top-bar-end";

/** Which section of the user settings dialog a setting row belongs to. */
export type PetrinautSettingSection = "general" | "viewport" | "labs";

/**
 * A user setting. Petrinaut renders the row from the spec, persists the value
 * under the plugin id and hands it to the body typed by `type`.
 */
export type PetrinautSettingSpec =
  | {
      type: "boolean";
      default: boolean;
      label: string;
      description?: string;
      section?: PetrinautSettingSection;
    }
  | {
      type: "enum";
      options: readonly string[];
      default: string;
      label: string;
      description?: string;
      section?: PetrinautSettingSection;
    };

/**
 * A feature flag: a boolean the user can turn on in the Labs section, shown
 * with the experimental marker. Persisted like a setting.
 */
export type PetrinautFlagSpec = {
  default: boolean;
  label: string;
  description?: string;
};

export type PetrinautSettingValue<Spec extends PetrinautSettingSpec> =
  Spec extends { type: "boolean" }
    ? boolean
    : Spec extends { type: "enum"; options: readonly (infer Option)[] }
      ? Option
      : never;

export interface PetrinautPluginManifest {
  /** Stable, namespaced id, e.g. `website.brunch`. */
  readonly id: string;
  /** Human-readable name: settings group headings and diagnostics. */
  readonly name: string;
  /** One or two sentences on what the plugin does, for the Plugins section of User settings. */
  readonly description?: string;
  /** Who maintains the plugin, shown beside the description. */
  readonly author?: string;
  /** Icon buttons in the toolbars; the body supplies icon and handler. */
  readonly buttons?: Readonly<
    Record<
      string,
      {
        readonly label: string;
        readonly place: PetrinautPluginButtonPlace;
        readonly tooltip?: string;
      }
    >
  >;
  /** Arbitrary content in the top bar; the body supplies the component. */
  readonly topBarItems?: Readonly<
    Record<string, { readonly place: PetrinautPluginTopBarPlace }>
  >;
  readonly settings?: Readonly<Record<string, PetrinautSettingSpec>>;
  readonly flags?: Readonly<Record<string, PetrinautFlagSpec>>;
  /**
   * The plugin provides the assistant window's content (`label`), or extends
   * the assistant another plugin provides (`extends`, that plugin's id). At
   * most one per plugin; the body returns the provider or the extension.
   */
  readonly assistant?:
    | { readonly label: string }
    | { readonly extends: string };
  /** Services this plugin provides to others, by token. */
  readonly provides?: Readonly<Record<string, PluginToken<unknown>>>;
  /**
   * Services this plugin needs. Required tokens order the install and fail it
   * when no installed plugin provides them; optional tokens resolve to
   * `undefined`.
   */
  readonly requires?: Readonly<Record<string, PluginToken<unknown>>>;
}

/**
 * Types a manifest with its literal keys and checks it against
 * `PetrinautPluginManifest`, so the body can be typed from it by name:
 *
 * ```ts
 * const brunchManifest = definePluginManifest({ id: "website.brunch", … });
 * type BrunchManifest = typeof brunchManifest;
 * const useBrunchPlugin: PetrinautPluginBody<BrunchManifest> = (api) => …;
 * ```
 */
export const definePluginManifest = <const M extends PetrinautPluginManifest>(
  manifest: M,
): M => manifest;

/** The persisted settings key of one plugin. */
export const pluginSettingsStorageKey = (pluginId: string): string =>
  `petrinaut:plugin:${pluginId}`;
