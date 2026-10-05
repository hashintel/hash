/**
 * One plugin's settings and flags: state of the component that runs the
 * plugin, loaded from and persisted to one storage key per plugin, with
 * values reconciled against the manifest on load.
 */

import { useState } from "react";

import {
  type PetrinautFlagSpec,
  type PetrinautPluginManifest,
  type PetrinautSettingSpec,
  pluginSettingsStorageKey,
} from "./plugin-manifest";

export type PluginSettingValue = boolean | string;

export interface PluginSettings {
  readonly values: Readonly<Record<string, PluginSettingValue>>;
  /** Validates against the manifest, persists and updates; throws on an unknown key or value. */
  readonly set: (key: string, value: PluginSettingValue) => void;
}

type Spec = PetrinautSettingSpec | PetrinautFlagSpec;

/** Settings and flags share one storage object; a key may not appear in both. */
const specsOf = (
  manifest: PetrinautPluginManifest,
): Readonly<Record<string, Spec>> => ({
  ...manifest.settings,
  ...manifest.flags,
});

const accepts = (spec: Spec, value: unknown): value is PluginSettingValue =>
  "type" in spec && spec.type === "enum"
    ? typeof value === "string" && spec.options.includes(value)
    : typeof value === "boolean";

const storage = (): Storage | undefined => {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    // Access itself throws where storage is disabled.
    return undefined;
  }
};

/**
 * The stored values the specs accept, the rest defaulted. Unknown keys are
 * dropped, so a renamed setting does not linger.
 */
export const loadPluginSettings = (
  manifest: PetrinautPluginManifest,
): Readonly<Record<string, PluginSettingValue>> => {
  let stored: unknown = {};
  try {
    const raw = storage()?.getItem(pluginSettingsStorageKey(manifest.id));
    if (raw !== null && raw !== undefined) stored = JSON.parse(raw);
  } catch {
    stored = {};
  }

  return Object.fromEntries(
    Object.entries(specsOf(manifest)).map(([key, spec]) => {
      const candidate =
        typeof stored === "object" && stored !== null && key in stored
          ? (stored as Record<string, unknown>)[key]
          : undefined;

      return [key, accepts(spec, candidate) ? candidate : spec.default];
    }),
  );
};

const persistPluginSettings = (
  manifest: PetrinautPluginManifest,
  values: Readonly<Record<string, PluginSettingValue>>,
): void => {
  try {
    storage()?.setItem(
      pluginSettingsStorageKey(manifest.id),
      JSON.stringify(values),
    );
  } catch {
    // Storage may be full or unavailable; the in-memory value still applies.
  }
};

/** The value of one declared setting or flag. */
export const readPluginSetting = (
  settings: PluginSettings,
  pluginId: string,
  key: string,
): PluginSettingValue => {
  const value = settings.values[key];
  if (value === undefined) {
    throw new Error(`Plugin "${pluginId}" has no setting or flag "${key}".`);
  }

  return value;
};

export const usePluginSettings = (
  manifest: PetrinautPluginManifest,
): PluginSettings => {
  const [values, setValues] = useState(() => loadPluginSettings(manifest));
  const specs = specsOf(manifest);

  return {
    values,
    set: (key, value) => {
      const spec = specs[key];
      if (!spec || !accepts(spec, value)) {
        throw new Error(
          `Plugin "${manifest.id}" setting "${key}" rejects ${JSON.stringify(value)}.`,
        );
      }
      const next = { ...values, [key]: value };
      persistPluginSettings(manifest, next);
      setValues(next);
    },
  };
};
