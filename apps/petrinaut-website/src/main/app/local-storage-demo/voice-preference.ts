import {
  isInterviewBudgetLevel,
  type InterviewBudgetLevel,
} from "../../../shared/interview-budget";
import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";
import { usePersistedState } from "./use-persisted-state";

export const voicePreferenceStorageKey = "petrinaut-website:voice-enabled";

const readVoicePreference = (): boolean =>
  readBrowserStorage(localStorage, voicePreferenceStorageKey) !== "false";

const writeVoicePreference = (enabled: boolean): void =>
  writeBrowserStorage(localStorage, voicePreferenceStorageKey, String(enabled));

export const useVoicePreference = () => {
  const [enabled, setEnabled, ready] = usePersistedState({
    fallback: true,
    read: readVoicePreference,
    write: writeVoicePreference,
  });
  return { enabled, ready, setEnabled };
};

const interviewBudgetStorageKey = "petrinaut-website:interview-budget";
const readInterviewBudget = (): InterviewBudgetLevel => {
  const value = readBrowserStorage(localStorage, interviewBudgetStorageKey);
  return isInterviewBudgetLevel(value) ? value : "standard";
};
const writeInterviewBudget = (level: InterviewBudgetLevel): void =>
  writeBrowserStorage(localStorage, interviewBudgetStorageKey, level);

export const useInterviewBudgetPreference = () => {
  const [level, setLevel] = usePersistedState<InterviewBudgetLevel>({
    fallback: "standard",
    read: readInterviewBudget,
    write: writeInterviewBudget,
  });
  return { level, setLevel };
};

const realtimePreferenceStorageKey = "petrinaut-website:realtime-enabled";

const readRealtimePreference = (): boolean =>
  readBrowserStorage(localStorage, realtimePreferenceStorageKey) === "true";

const writeRealtimePreference = (enabled: boolean): void =>
  writeBrowserStorage(
    localStorage,
    realtimePreferenceStorageKey,
    String(enabled),
  );

export const useRealtimePreference = () => {
  const [enabled, setEnabled, ready] = usePersistedState({
    fallback: false,
    read: readRealtimePreference,
    write: writeRealtimePreference,
  });
  return { enabled, ready, setEnabled };
};
