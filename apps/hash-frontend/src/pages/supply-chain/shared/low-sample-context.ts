import { createContext, useContext } from "react";

interface LowSampleContextValue {
  excludeLowSamples: boolean;
  setExcludeLowSamples: (exclude: boolean) => void;
}

export const LowSampleContext = createContext<LowSampleContextValue>({
  excludeLowSamples: false,
  setExcludeLowSamples: () => {},
});

export function useLowSampleSetting() {
  return useContext(LowSampleContext);
}
