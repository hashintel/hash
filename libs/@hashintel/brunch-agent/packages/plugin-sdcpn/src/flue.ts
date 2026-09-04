import {
  useInitialData,
  useInstruction,
  useSkill,
  useTool,
} from "@flue/runtime";
import * as v from "valibot";

import { preparedWorkpieceInitialDataMode } from "@hashintel/brunch-agent/workpiece";

import sdcpnAppend from "./prompts/APPEND_SYSTEM.md?raw";
import {
  SDCPN_MODELLING_SKILL_NAME,
  sdcpnModellingSkill,
} from "./skills/sdcpn-modelling/skill";
import {
  petrinautConstructionTools,
  petrinautFixtureTools,
} from "./tools/petrinaut-construction";
import {
  READ_PETRINAUT_DOC_TOOL_NAME,
  readPetrinautDoc,
} from "./tools/read-petrinaut-doc";

export const VALIDATED_CONSTRUCTION_MODE = "validated-construction";
export const validatedFixtureMutationMode = preparedWorkpieceInitialDataMode;

export const sdcpnInitialDataSchema = v.optional(
  v.object({
    mode: v.picklist([
      VALIDATED_CONSTRUCTION_MODE,
      validatedFixtureMutationMode,
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

  if (initialData?.mode === VALIDATED_CONSTRUCTION_MODE) {
    useInstruction(
      `
This is a construct-only headless conversation. Use only the supplied runbook IR as modelling input, do not interview, and build the net through the mounted Petrinaut tools instead of emitting net JSON.
`.replace(/^\s+|\s+$/gu, ""),
    );
    for (const constructionTool of petrinautConstructionTools) {
      useTool(constructionTool);
    }
  } else if (initialData?.mode === validatedFixtureMutationMode) {
    useInstruction(
      `
This is a visibly labelled prepared-fixture conversation. Treat its tagged prepared runbook-ir dispatch as test-authored revision zero, maintain the full Markdown workpiece in later responses, preserve explicit unknowns, and do not relabel prepared material as model-produced. Use only the mounted canonical Petrinaut read and least arc mutation when confirmed evidence calls for that change. Read the live document before mutating it, report rejected or no-op outcomes honestly, and do not construct unrelated net content.
`.replace(/^\s+|\s+$/gu, ""),
    );
    for (const fixtureTool of petrinautFixtureTools) {
      useTool(fixtureTool);
    }
  }
}

export { READ_PETRINAUT_DOC_TOOL_NAME, readPetrinautDoc };
export { SDCPN_MODELLING_SKILL_NAME };
export {
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  petrinautFixtureToolNames,
  petrinautConstructionTools,
  petrinautFixtureTools,
  type PetrinautConstructionToolName,
} from "./tools/petrinaut-construction";
