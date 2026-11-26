import { createContext } from "react";

/** How the stats render: as labelled columns on their own line, or as compact chips beside the title. */
export const FrameStatsDensityContext = createContext<"full" | "compact">(
  "full",
);
