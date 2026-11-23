import { requiredContext } from "../../../../../shared/required-context";

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

export const [ArcPropertiesContext, useArcPropertiesContext] =
  requiredContext<ArcPropertiesData>("ArcProperties");
