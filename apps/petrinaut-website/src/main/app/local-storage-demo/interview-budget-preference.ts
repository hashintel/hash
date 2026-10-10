import {
  isInterviewBudgetLevel,
  type InterviewBudgetLevel,
} from "../../../shared/interview-budget";
import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";
import { usePersistedState } from "./use-persisted-state";

const interviewBudgetStorageKey = "petrinaut-website:interview-budget";
const readInterviewBudget = (): InterviewBudgetLevel => {
  const value = readBrowserStorage(localStorage, interviewBudgetStorageKey);
  return isInterviewBudgetLevel(value) ? value : "standard";
};
const writeInterviewBudget = (level: InterviewBudgetLevel): void =>
  writeBrowserStorage(localStorage, interviewBudgetStorageKey, level);

const interviewBudgetEnabledStorageKey =
  "petrinaut-website:interview-budget-enabled";
const readInterviewBudgetEnabled = (): boolean =>
  readBrowserStorage(localStorage, interviewBudgetEnabledStorageKey) === "true";
const writeInterviewBudgetEnabled = (enabled: boolean): void =>
  writeBrowserStorage(
    localStorage,
    interviewBudgetEnabledStorageKey,
    String(enabled),
  );

export const useInterviewBudgetPreference = () => {
  const [level, setLevel, levelReady] = usePersistedState<InterviewBudgetLevel>(
    {
      fallback: "standard",
      read: readInterviewBudget,
      write: writeInterviewBudget,
    },
  );
  const [enabled, setEnabled, enabledReady] = usePersistedState({
    fallback: false,
    read: readInterviewBudgetEnabled,
    write: writeInterviewBudgetEnabled,
  });
  return {
    level,
    setLevel,
    enabled,
    setEnabled,
    ready: levelReady && enabledReady,
  };
};
