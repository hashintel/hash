import type { ActualModeContextValue } from "./types";

const noopSetCurrentFrameIndex = () => {};

export const unavailableActualMode: ActualModeContextValue = {
  available: false,
  source: null,
  status: "unavailable",
  title: null,
  definition: null,
  initialState: null,
  transitionFirings: [],
  receivedEvents: [],
  currentFrameIndex: 0,
  timelineStartedAtMs: null,
  timelineNowMs: null,
  setCurrentFrameIndex: noopSetCurrentFrameIndex,
  error: null,
};
