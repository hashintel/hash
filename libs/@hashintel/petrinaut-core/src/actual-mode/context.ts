import type { ActualModeContextValue } from "./types";

export const unavailableActualMode: ActualModeContextValue = {
  available: false,
  source: null,
  status: "unavailable",
  title: null,
  definition: null,
  initialState: null,
  transitionFirings: [],
  receivedEvents: [],
  timelineStartedAtMs: null,
  timelineNowMs: null,
  error: null,
};
