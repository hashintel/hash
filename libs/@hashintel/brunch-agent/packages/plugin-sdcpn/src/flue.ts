import {
  type Skill,
  useInitialData,
  useInstruction,
  useSkill,
  useTool,
} from "@flue/runtime";
import * as v from "valibot";

import { petrinautConstructionTools } from "./tools/petrinaut-construction";
import {
  READ_PETRINAUT_DOC_TOOL_NAME,
  readPetrinautDoc,
} from "./tools/read-petrinaut-doc";

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

  useInstruction(
    `
You are eliciting a process model as an SDCPN for the Petrinaut editor.
Activate the \`sdcpn-modelling\` skill before interviewing or constructing a process model.
The Markdown IR is the shared workpiece of one looping lifecycle.
When the user asks how Petrinaut's UI works, call readPetrinautDoc.
`.replace(/^\s+|\s+$/gu, ""),
  );
  useSkill(sdcpnModellingSkill);
  useTool(readPetrinautDoc);

  if (initialData?.mode === VALIDATED_CONSTRUCTION_MODE) {
    useInstruction(
      `
This is a construct-only headless conversation. Use only the supplied runbook IR as modelling input, do not interview, and build the net through the mounted Petrinaut tools instead of emitting net JSON.
`.replace(/^\s+|\s+$/gu, ""),
    );
    for (const constructionTool of petrinautConstructionTools) {
      useTool(constructionTool);
    }
  }
}

export { READ_PETRINAUT_DOC_TOOL_NAME, readPetrinautDoc };
export {
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  petrinautConstructionTools,
  type PetrinautConstructionToolName,
} from "./tools/petrinaut-construction";
