import {
  useInitialData,
  useInstruction,
  useSkill,
  useTool,
} from "@flue/runtime";
import * as v from "valibot";

import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

import sdcpnAppend from "./prompts/APPEND_SYSTEM.md?raw";
import {
  SDCPN_MODELLING_SKILL_NAME,
  sdcpnModellingSkill,
} from "./skills/sdcpn-modelling/skill";
import { petrinautConstructionTools } from "./tools/petrinaut-construction";
import {
  READ_PETRINAUT_DOC_TOOL_NAME,
  readPetrinautDoc,
} from "./tools/read-petrinaut-doc";

export const VALIDATED_CONSTRUCTION_MODE = "validated-construction";
export const SCRATCH_PROJECT_CONSTRUCTION_MODE = "scratch-project-construction";

export const sdcpnInitialDataSchema = v.optional(
  v.object({
    mode: v.picklist([
      VALIDATED_CONSTRUCTION_MODE,
      SCRATCH_PROJECT_CONSTRUCTION_MODE,
    ]),
  }),
);

export type SdcpnInitialData = v.InferOutput<typeof sdcpnInitialDataSchema>;

/** Mount the prompt material, skill, and conditional tools owned by the SDCPN plugin. */
export function useSdcpnPlugin(): void {
  const initialData = useInitialData<SdcpnInitialData>();

  useInstruction(sdcpnAppend.trim());
  useSkill(sdcpnModellingSkill);
  useTool(readPetrinautDoc);
  useInstruction(
    `
Before answering any request about this net, the current net, or the existing net—including before beginning an interview—call \`${getLatestNetDefinitionToolName}\`.
Do not say the canvas is unavailable while you can call \`${getLatestNetDefinitionToolName}\`.
`.trim(),
  );

  if (initialData?.mode === SCRATCH_PROJECT_CONSTRUCTION_MODE) {
    useInstruction(
      `
This conversation controls one empty Petrinaut scratch project. Elicit in the person's vocabulary and maintain the workpiece as usual. Once the person has supplied a sufficiently concrete bounded process or asks you to use sensible defaults, automatically read the current net and construct the complete small connected draft through the mounted Petrinaut tools. Do not ask for separate preview, publish, generate, or finish permission, and do not emit net JSON.

Only construct when getLatestNetDefinition confirms that the document is empty. If it contains any place, transition, type, parameter, differential equation, subnet, component instance, scenario, or metric, do not perform automatic whole-net construction; explain that this temporary mode only targets an empty scratch project. Use stable descriptive ids, visible non-overlapping positions, and connect every constructed transition through canonical addArc calls. The canvas updates after each accepted client-tool result, so never claim completion if a call is rejected or remains pending.
`.replace(/^\s+|\s+$/gu, ""),
    );
  } else if (initialData?.mode === VALIDATED_CONSTRUCTION_MODE) {
    useInstruction(
      `
This is a construct-only headless conversation. Use only the supplied runbook IR as modelling input, do not interview, and build the net through the mounted Petrinaut tools instead of emitting net JSON.
`.replace(/^\s+|\s+$/gu, ""),
    );
  }

  const constructionModeEnabled =
    initialData?.mode === SCRATCH_PROJECT_CONSTRUCTION_MODE ||
    initialData?.mode === VALIDATED_CONSTRUCTION_MODE;
  for (const petrinautTool of petrinautConstructionTools) {
    if (
      petrinautTool.name === getLatestNetDefinitionToolName ||
      constructionModeEnabled
    ) {
      useTool(petrinautTool);
    }
  }
}

export { READ_PETRINAUT_DOC_TOOL_NAME, readPetrinautDoc };
export { SDCPN_MODELLING_SKILL_NAME };
export {
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  petrinautConstructionTools,
  type PetrinautConstructionToolName,
} from "./tools/petrinaut-construction";
