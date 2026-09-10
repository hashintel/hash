import {
  useDelivery,
  useInitialData,
  useInstruction,
  useSkill,
  useTool,
} from "@flue/runtime";
import * as v from "valibot";

import {
  preparedWorkpieceInitialDataMode,
  preparedWorkpieceSignalType,
} from "@hashintel/brunch-agent/workpiece";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core";

import sdcpnAppend from "./prompts/APPEND_SYSTEM.md?raw";
import {
  SDCPN_MODELLING_SKILL_NAME,
  sdcpnModellingSkill,
} from "./skills/sdcpn-modelling/skill";
import {
  petrinautConstructionTools,
  petrinautFixtureToolNames,
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
  const delivery = useDelivery();

  useInstruction(sdcpnAppend.trim());
  useInstruction(
    `
Before answering a user request about this model or the current, open, visible, or existing net—including explaining it, reviewing it, checking completeness, or beginning an interview—call \`${getLatestNetDefinitionToolName}\` once for that user turn unless its client-tool result is already present in the current continuation.
Use the returned live state as machine evidence. Do not say the canvas or net is unavailable while this tool is callable, and do not reuse a snapshot from an earlier user turn.
`.trim(),
  );
  useSkill(sdcpnModellingSkill);
  useTool(readPetrinautDoc);

  const isValidatedConstruction =
    initialData?.mode === VALIDATED_CONSTRUCTION_MODE;
  const isPreparedFixture = initialData?.mode === validatedFixtureMutationMode;
  const isPreparedFixtureInitialization =
    delivery.kind === "signal" && delivery.type === preparedWorkpieceSignalType;
  const fixtureToolNameSet = new Set<string>(petrinautFixtureToolNames);

  if (isValidatedConstruction) {
    useInstruction(
      `
This is a construct-only headless conversation. Use only the supplied runbook IR as modelling input, do not interview, and build the net through the mounted Petrinaut tools instead of emitting net JSON.
`.replace(/^\s+|\s+$/gu, ""),
    );
  } else if (isPreparedFixture) {
    useInstruction(
      `
This is a visibly labelled prepared-fixture conversation. Treat its tagged prepared runbook-ir dispatch as test-authored revision zero, maintain the full Markdown workpiece in later responses, preserve explicit unknowns, and do not relabel prepared material as model-produced. The prepared dispatch only initializes the fixture: acknowledge it without emitting a workpiece or beginning construction, then wait for a later true-user message to supply confirmed evidence. A fragment, topic label, request to inspect or explain, or unrelated message is not confirmation and must not authorize a mutation; ask for the missing confirmation instead. After receiving explicit evidence that confirms or corrects the operational fact requiring a net change, emit the full current workpiece in a fenced runbook-ir block before the first construction tool call and again before final delivery. Every later assistant-authored workpiece is model-produced: label that revision accordingly and do not copy revision zero's claim that the current revision is test-authored. Use only the mounted canonical Petrinaut read and least arc mutation when confirmed evidence calls for that change. Read the live document before mutating it, report rejected or no-op outcomes honestly, and do not construct unrelated net content.
`.replace(/^\s+|\s+$/gu, ""),
    );
  }

  for (const constructionTool of petrinautConstructionTools) {
    const isCurrentNetRead =
      constructionTool.name === getLatestNetDefinitionToolName;
    const isFixtureMutation =
      !isCurrentNetRead && fixtureToolNameSet.has(constructionTool.name);
    if (
      isValidatedConstruction ||
      (isCurrentNetRead && delivery.kind === "user") ||
      (isPreparedFixture &&
        !isPreparedFixtureInitialization &&
        isFixtureMutation)
    ) {
      useTool(constructionTool);
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
