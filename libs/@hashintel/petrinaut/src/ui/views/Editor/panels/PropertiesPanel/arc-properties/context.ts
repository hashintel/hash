import { createContext, use } from "react";

import type { ArcEndpoint, InputArc } from "@hashintel/petrinaut-core";

export interface ArcPropertiesData {
  transitionId: string;
  endpoint: ArcEndpoint;
  arcDirection: "input" | "output";
  sourceName: string;
  targetName: string;
  weight: number;
  type: InputArc["type"];
}

export const ArcPropertiesContext = createContext<ArcPropertiesData | null>(
  null,
);

export const useArcPropertiesContext = (): ArcPropertiesData => {
  const context = use(ArcPropertiesContext);
  if (!context) {
    throw new Error(
      "useArcPropertiesContext must be used within ArcProperties",
    );
  }
  return context;
};
