/**
 * The manifest: what a plugin contributes, as plain data.
 *
 * Petrinaut reads it before the body runs, so User settings can list a
 * plugin's buttons, settings and assistant, and the editor can order plugins
 * by their tokens, without running plugin code. Each contribution is keyed
 * by an id unique within the plugin; Petrinaut stores and renders it under
 * the plugin id. The body's providers and settings API are typed by these
 * keys.
 */

import type { PluginToken } from "./plugin-token";

/** Where the editor renders a plugin button. */
export type PetrinautPluginButtonPlace =
  /** The left part of the top bar, after the menu button and before the title. */
  | "top-bar-start"
  /** The right end of the top bar, after the built-in buttons. */
  | "top-bar-end"
  /** The viewport controls at the bottom right of the canvas, below the built-in buttons. */
  | "viewport-controls";

/** Where the editor renders a top-bar item: before the title or at the top bar's right end. */
export type PetrinautPluginTopBarPlace = "top-bar-start" | "top-bar-end";

/** The User settings section that shows a setting row: `general`, `viewport` or `labs`. */
export type PetrinautSettingSection = "general" | "viewport" | "labs";

/**
 * A user setting: an on/off toggle or a choice among strings.
 * The editor renders its row in User settings and keeps the value in local storage.
 */
export type PetrinautSettingSpec =
  | {
      /** An on/off toggle; the body reads a `boolean`. */
      type: "boolean";
      /** The value until the user changes it, and whenever the stored value does not fit the spec. */
      default: boolean;
      /** The row's title in User settings. */
      label: string;
      /** A sentence under the label explaining what the setting changes. */
      description?: string;
      /** The User settings section that shows the row. Defaults to `general`. */
      section?: PetrinautSettingSection;
    }
  | {
      /** A select among `options`; the body reads one of them. */
      type: "enum";
      /** The choices, shown in the select as written. */
      options: readonly string[];
      /**
       * The value until the user changes it, and whenever the stored value is not one of `options`.
       * Must be one of `options`.
       */
      default: string;
      /** The row's title in User settings. */
      label: string;
      /** A sentence under the label explaining what the setting changes. */
      description?: string;
      /** The User settings section that shows the row. Defaults to `general`. */
      section?: PetrinautSettingSection;
    };

/**
 * An on/off switch in the Labs section of User settings, shown with the experimental marker.
 * Kept in local storage with the plugin's settings.
 */
export type PetrinautFlagSpec = {
  /** Whether the flag is on until the user switches it. */
  default: boolean;
  /** The row's title in the Labs section. */
  label: string;
  /** A sentence under the label explaining what the flag turns on. */
  description?: string;
};

/** The value a setting spec holds: a `boolean`, or the union of an enum's `options`. */
export type PetrinautSettingValue<Spec extends PetrinautSettingSpec> =
  Spec extends { type: "boolean" }
    ? boolean
    : Spec extends { type: "enum"; options: readonly (infer Option)[] }
      ? Option
      : never;

/**
 * What a plugin contributes to the editor, as plain data read before the body runs.
 * The body returns the behaviour and components for these contributions under the same keys.
 */
export interface PetrinautPluginManifest {
  /**
   * Stable, namespaced id, unique among the plugins passed to the editor, e.g. `website.brunch`.
   * Stored settings, the user's on/off switch and the assistant choice are keyed by it.
   */
  readonly id: string;
  /** Display name in the Plugins section of User settings and above the plugin's setting rows. */
  readonly name: string;
  /** A sentence or two on what the plugin does, shown when its Plugins section row is expanded. */
  readonly description?: string;
  /** Who maintains the plugin, shown beside its name in the Plugins section. */
  readonly author?: string;
  /**
   * Icon buttons in the editor's toolbars, keyed by id.
   * The body returns each button's icon and click handler under the same key in `buttons`.
   */
  readonly buttons?: Readonly<
    Record<
      string,
      {
        /** The button's accessible name, and its tooltip unless `tooltip` is set. */
        readonly label: string;
        /** Which toolbar shows the button. */
        readonly place: PetrinautPluginButtonPlace;
        /** Tooltip text. Defaults to `label`. */
        readonly tooltip?: string;
      }
    >
  >;
  /**
   * Custom content in the top bar, keyed by id; the key also names the item in the Plugins section.
   * The body returns a React node per key in `topBarItems`, shown after the plugin's buttons.
   */
  readonly topBarItems?: Readonly<
    Record<
      string,
      {
        /** Which end of the top bar shows the item. */
        readonly place: PetrinautPluginTopBarPlace;
      }
    >
  >;
  /**
   * Rows the editor adds to User settings, keyed by the name the body reads in `api.settings`.
   * Kept in local storage per plugin; a key may not also appear in `flags`.
   */
  readonly settings?: Readonly<Record<string, PetrinautSettingSpec>>;
  /**
   * Experimental switches in the Labs section, keyed by the name the body reads in `api.flags`.
   * Stored with the settings; a key may not also appear in `settings`.
   */
  readonly flags?: Readonly<Record<string, PetrinautFlagSpec>>;
  /**
   * Declares an assistant with `label`, or extends another plugin's assistant with `extends`.
   * The body returns the matching provider or extension in `assistant`.
   */
  readonly assistant?:
    | {
        /**
         * The assistant's name in the assistant selector and the commands that switch to it.
         * Until the user picks another, the editor shows the first running assistant.
         */
        readonly label: string;
      }
    | {
        /**
         * The id of the plugin whose assistant this one extends.
         * The extension applies only while that assistant is the one shown.
         */
        readonly extends: string;
      };
  /**
   * Services this plugin offers others, keyed by name, each a token from `definePluginToken`.
   * The body returns each value under the same key in `provides`.
   * The editor throws when two plugins provide one token.
   */
  readonly provides?: Readonly<Record<string, PluginToken<unknown>>>;
  /**
   * Services this plugin needs, keyed by the name the body reads in `api.deps`.
   * The editor throws when a required token has no provider; an `.optional()` one is `undefined`.
   * Switching a required provider off stops this plugin too.
   */
  readonly requires?: Readonly<Record<string, PluginToken<unknown>>>;
}

/**
 * Checks a manifest and keeps its keys literal, so a body can be typed from it.
 * Use it to declare the manifest apart from the body; it returns the manifest unchanged.
 *
 * @example
 * ```ts
 * const brunchManifest = definePluginManifest({
 *   id: "website.brunch",
 *   name: "Brunch",
 *   assistant: { label: "Brunch" },
 * });
 * const useBrunchPlugin: PetrinautPluginBody<typeof brunchManifest> = () => ({
 *   assistant: { chat: brunchChat },
 * });
 * ```
 */
export const definePluginManifest = <const M extends PetrinautPluginManifest>(
  manifest: M,
): M => manifest;

/** The local storage key that holds one plugin's settings and flags. */
export const pluginSettingsStorageKey = (pluginId: string): string =>
  `petrinaut:plugin:${pluginId}`;
