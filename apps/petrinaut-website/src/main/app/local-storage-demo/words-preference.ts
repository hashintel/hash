import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";
import { usePersistedState } from "./use-persisted-state";

export const wordsPreferenceStorageKey = "petrinaut-website:words-enabled";

const read = (): boolean =>
  readBrowserStorage(localStorage, wordsPreferenceStorageKey) === "true";
const write = (enabled: boolean): void =>
  writeBrowserStorage(localStorage, wordsPreferenceStorageKey, String(enabled));

export const useWordsPreference = () => {
  const [enabled, setEnabled, ready] = usePersistedState({
    fallback: false,
    read,
    write,
    storageKey: wordsPreferenceStorageKey,
  });
  return { enabled, setEnabled, ready };
};
