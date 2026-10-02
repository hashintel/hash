import { usePersistedState } from "./use-persisted-state";

export const wordsPreferenceStorageKey = "petrinaut-website:words-enabled";

const read = (): boolean => {
  try {
    return localStorage.getItem(wordsPreferenceStorageKey) === "true";
  } catch {
    return false;
  }
};
const write = (enabled: boolean): void => {
  try {
    localStorage.setItem(wordsPreferenceStorageKey, String(enabled));
  } catch {
    /* A Labs preference remains tab-local when storage is blocked. */
  }
};

export const useWordsPreference = () => {
  const [enabled, setEnabled, ready] = usePersistedState({
    fallback: false,
    read,
    write,
    storageKey: wordsPreferenceStorageKey,
  });
  return { enabled, setEnabled, ready };
};
