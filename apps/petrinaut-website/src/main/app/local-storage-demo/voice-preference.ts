import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";
import { usePersistedState } from "./use-persisted-state";

export const voicePreferenceStorageKey = "petrinaut-website:voice-enabled";

const readVoicePreference = (): boolean =>
  readBrowserStorage(localStorage, voicePreferenceStorageKey) === "true";

const writeVoicePreference = (enabled: boolean): void =>
  writeBrowserStorage(localStorage, voicePreferenceStorageKey, String(enabled));

export const useVoicePreference = () => {
  const [enabled, setEnabled, ready] = usePersistedState({
    enabled: true,
    fallback: false,
    read: readVoicePreference,
    write: writeVoicePreference,
  });
  return { enabled, ready, setEnabled };
};
