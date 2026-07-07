import { createContext } from "react";

import { unavailableActualMode } from "@hashintel/petrinaut-core";

import type { ActualModeContextValue } from "@hashintel/petrinaut-core";

export const ActualModeContext = createContext<ActualModeContextValue>(
  unavailableActualMode,
);

export type { ActualModeContextValue };
