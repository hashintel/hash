import {
  type Skill,
  useInitialData,
  useInstruction,
  useSkill,
  useTool,
} from "@flue/runtime";
import * as v from "valibot";

import {
  SDCPN_CONSTRUCTION_INSTRUCTIONS,
  SDCPN_SYSTEM_INSTRUCTIONS,
} from "./system-instructions";
import { petrinautConstructionTools } from "./tools/petrinaut-construction";

export {
  SDCPN_CONSTRUCTION_INSTRUCTIONS,
  SDCPN_SYSTEM_INSTRUCTIONS,
} from "./system-instructions";

export const VALIDATED_CONSTRUCTION_MODE = "validated-construction";

export const sdcpnInitialDataSchema = v.optional(
  v.object({
    mode: v.literal(VALIDATED_CONSTRUCTION_MODE),
  }),
);

export type SdcpnInitialData = v.InferOutput<typeof sdcpnInitialDataSchema>;

/** Mount the prompt material, skill, and conditional tools owned by the SDCPN plugin. */
export function useSdcpnPlugin(sdcpnModellingSkill: Skill): void {
  const initialData = useInitialData<SdcpnInitialData>();

  useInstruction(SDCPN_SYSTEM_INSTRUCTIONS);
  useSkill(sdcpnModellingSkill);

  if (initialData?.mode === VALIDATED_CONSTRUCTION_MODE) {
    useInstruction(SDCPN_CONSTRUCTION_INSTRUCTIONS);
    for (const constructionTool of petrinautConstructionTools) {
      useTool(constructionTool);
    }
  }
}

export {
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  petrinautConstructionTools,
  type PetrinautConstructionToolName,
} from "./tools/petrinaut-construction";
