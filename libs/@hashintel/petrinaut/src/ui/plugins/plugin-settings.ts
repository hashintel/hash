/**
 * One plugin's settings, stored under `petrinaut:plugin:<id>` and checked
 * against the manifest's specs. Each change gives a new snapshot, which
 * becomes the plugin's `api.settings` and re-runs its hook.
 */

import { useState } from "react";

import { createReadableStore } from "@hashintel/petrinaut-core";

import { useStore } from "../../react/use-store";

import type {
  PetrinautPluginManifest,
  PetrinautSettingSpec,
} from "./define-petrinaut-plugin";

type PluginSettingValues = Readonly<Record<string, boolean | string>>;

/** One snapshot of a plugin's settings; `get` and `set` act on the latest values. */
export interface PluginSettings {
  readonly values: PluginSettingValues;
  readonly get: (key: string) => boolean | string | undefined;
  /** Validates, persists and stores the value; throws on a value the spec rejects. */
  readonly set: (key: string, value: unknown) => void;
}

const storageKey = (pluginId: string) => `petrinaut:plugin:${pluginId}`;

const accepts = (
  spec: PetrinautSettingSpec,
  value: unknown,
): value is boolean | string =>
  spec.type === "enum"
    ? typeof value === "string" && spec.options.includes(value)
    : typeof value === "boolean";

/** The stored values the specs accept, the others defaulted; unknown keys are dropped. */
const loadValues = (manifest: PetrinautPluginManifest): PluginSettingValues => {
  let stored: Partial<Record<string, unknown>> = {};
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(storageKey(manifest.id)) ?? "{}",
    );
    if (typeof parsed === "object" && parsed !== null) {
      stored = parsed;
    }
  } catch {
    // Storage is unavailable or the value is corrupt: every setting reads its default.
  }

  return Object.fromEntries(
    Object.entries(manifest.settings ?? {}).map(([key, spec]) => {
      const value = stored[key];

      return [key, accepts(spec, value) ? value : spec.default];
    }),
  );
};

/** The plugin's settings, loaded once per host; a new snapshot after each change. */
export const usePluginSettings = (
  manifest: PetrinautPluginManifest,
): PluginSettings => {
  const [store] = useState(() => createReadableStore(loadValues(manifest)));
  const values = useStore(store);

  return {
    values,
    get: (key) => store.get()[key],
    set: (key, value) => {
      const spec = manifest.settings?.[key];
      if (spec === undefined || !accepts(spec, value)) {
        throw new Error(
          `Plugin "${manifest.id}" setting "${key}" rejects ${JSON.stringify(value)}.`,
        );
      }
      store.set({ ...store.get(), [key]: value });
      try {
        localStorage.setItem(
          storageKey(manifest.id),
          JSON.stringify(store.get()),
        );
      } catch {
        // Storage may be full or unavailable; the value applies until reload.
      }
    },
  };
};
