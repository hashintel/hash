/**
 * Persistence for one plugin's settings and flags: one storage key per
 * plugin, values reconciled against the manifest on load.
 */

import {
  createReadableStore,
  type ReadableStore,
} from "@hashintel/petrinaut-core";

import {
  type PetrinautFlagSpec,
  type PetrinautSettingSpec,
  pluginSettingsStorageKey,
} from "./plugin-manifest";

/** The subset of `Storage` the store uses, so hosts and tests can swap it. */
export interface PluginSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type SettingValue = boolean | string;

export interface PluginSettingsStore {
  get(key: string): SettingValue;
  set(key: string, value: SettingValue): void;
  store(key: string): ReadableStore<SettingValue>;
}

const defaultValue = (spec: PetrinautSettingSpec | PetrinautFlagSpec) =>
  spec.default;

const accepts = (
  spec: PetrinautSettingSpec | PetrinautFlagSpec,
  value: unknown,
): value is SettingValue =>
  "type" in spec && spec.type === "enum"
    ? typeof value === "string" && spec.options.includes(value)
    : typeof value === "boolean";

/**
 * Reads the stored values, keeps those the specs accept, and defaults the
 * rest. Unknown keys are dropped, so a renamed setting does not linger.
 */
const load = (
  storage: PluginSettingsStorage | undefined,
  storageKey: string,
  specs: Readonly<Record<string, PetrinautSettingSpec | PetrinautFlagSpec>>,
): Record<string, SettingValue> => {
  let stored: unknown = {};
  try {
    const raw = storage?.getItem(storageKey);
    if (raw !== null && raw !== undefined) stored = JSON.parse(raw);
  } catch {
    stored = {};
  }
  const values: Record<string, SettingValue> = {};
  for (const [key, spec] of Object.entries(specs)) {
    const candidate =
      typeof stored === "object" && stored !== null && key in stored
        ? (stored as Record<string, unknown>)[key]
        : undefined;
    values[key] = accepts(spec, candidate) ? candidate : defaultValue(spec);
  }
  return values;
};

export const createPluginSettingsStore = (input: {
  pluginId: string;
  settings: Readonly<Record<string, PetrinautSettingSpec>> | undefined;
  flags: Readonly<Record<string, PetrinautFlagSpec>> | undefined;
  storage: PluginSettingsStorage | undefined;
}): PluginSettingsStore => {
  // Settings and flags share one storage object; a key may not appear in both.
  const specs = { ...input.settings, ...input.flags };
  const storageKey = pluginSettingsStorageKey(input.pluginId);
  const values = load(input.storage, storageKey, specs);
  const stores = new Map(
    Object.entries(values).map(([key, value]) => [
      key,
      createReadableStore<SettingValue>(value),
    ]),
  );
  const storeFor = (key: string) => {
    const store = stores.get(key);
    if (!store) {
      throw new Error(
        `Plugin "${input.pluginId}" has no setting or flag "${key}".`,
      );
    }
    return store;
  };
  const persist = () => {
    try {
      input.storage?.setItem(storageKey, JSON.stringify(values));
    } catch {
      // Storage may be full or unavailable; the in-memory value still applies.
    }
  };
  return {
    get: (key) => storeFor(key).get(),
    set(key, value) {
      const spec = specs[key];
      if (!spec || !accepts(spec, value)) {
        throw new Error(
          `Plugin "${input.pluginId}" setting "${key}" rejects ${JSON.stringify(value)}.`,
        );
      }
      values[key] = value;
      storeFor(key).set(value);
      persist();
    },
    store: (key) => storeFor(key),
  };
};
