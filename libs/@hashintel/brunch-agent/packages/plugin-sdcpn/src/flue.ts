import {
  useAgentStart,
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
  type WorkpieceRevision,
} from "@hashintel/brunch-agent/workpiece";

import { sha256Pattern } from "./declared-basis";
import sdcpnAppend from "./prompts/APPEND_SYSTEM.md?raw";
import { browserBindingSchema } from "./root-arc";
import {
  SDCPN_MODELLING_SKILL_NAME,
  sdcpnModellingSkill,
} from "./skills/sdcpn-modelling/skill";
import {
  createJoinedRootArcTool,
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
  v.pipe(
    v.object({
      mode: v.picklist([
        VALIDATED_CONSTRUCTION_MODE,
        validatedFixtureMutationMode,
      ]),
      browser: v.optional(
        v.strictObject({
          binding: browserBindingSchema,
          requestedBaseHash: v.pipe(v.string(), v.regex(sha256Pattern)),
        }),
      ),
    }),
    v.check(
      (data) =>
        data.browser === undefined ||
        data.mode === validatedFixtureMutationMode,
      "Browser binding is admitted only for the prepared root-arc tracer.",
    ),
  ),
);

export type SdcpnInitialData = v.InferOutput<typeof sdcpnInitialDataSchema>;

/** Mount the prompt material, skill, and conditional tools owned by the SDCPN plugin. */
export function useSdcpnPlugin(options?: {
  currentRevision: WorkpieceRevision | null;
  retainedRevisionFor: (
    revisionId: string,
  ) => Promise<WorkpieceRevision | undefined>;
}): void {
  const initialData = useInitialData<SdcpnInitialData>();
  const delivery = useDelivery();

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
    const joined = initialData.browser;
    const isPreparedFixtureInitialization = joined
      ? options?.currentRevision == null
      : delivery.kind === "signal" &&
        delivery.type === preparedWorkpieceSignalType;
    if (joined && !options)
      throw new Error(
        "Joined construction requires the core settled revision authority.",
      );
    if (joined && options) {
      useAgentStart(({ append }) => {
        append({
          kind: "signal",
          type: "brunch.construction-context",
          tagName: "brunch.construction-context",
          body: JSON.stringify({
            browser: joined,
            currentWorkpiece: options.currentRevision,
          }),
        });
      });
      useInstruction(
        "This is a labelled prepared-fixture mechanical tracer, not genuine construction. Settle the full workpiece with update_workpiece before construction. Never mix server and browser tools in one proposal. The current settled WorkpieceRevision is the sole new-workpiece authority. Cite its exact revisionId and sha256 in brunch.basis with immutable UTF-16 span locators, rationale and operation scope, or declare basis absent with a reason. Older citations require explicit supersessionIntended and retained settled history. Read the live document and cite the issued requestedBaseHash. Only one root place arc is admitted; do not retry stale, unknown or conflicting outcomes. Prepared material is test-authored, not elicited testimony.",
      );
    } else
      useInstruction(
        `
This is a visibly labelled prepared-fixture conversation. Treat its tagged prepared runbook-ir dispatch as test-authored revision zero, maintain the full Markdown workpiece in later responses, preserve explicit unknowns, and do not relabel prepared material as model-produced. The prepared dispatch only initializes the fixture: acknowledge it without emitting a workpiece or beginning construction, then wait for a later true-user message to supply confirmed evidence. A fragment, topic label, request to inspect or explain, or unrelated message is not confirmation and must not authorize a mutation; ask for the missing confirmation instead. After receiving explicit evidence that confirms or corrects the operational fact requiring a net change, emit the full current workpiece in a fenced runbook-ir block before the first construction tool call and again before final delivery. Every later assistant-authored workpiece is model-produced: label that revision accordingly and do not copy revision zero's claim that the current revision is test-authored. Use only the mounted canonical Petrinaut read and least arc mutation when confirmed evidence calls for that change. Read the live document before mutating it, report rejected or no-op outcomes honestly, and do not construct unrelated net content.
`.replace(/^\s+|\s+$/gu, ""),
      );
    if (!isPreparedFixtureInitialization) {
      for (const fixtureTool of petrinautFixtureTools) {
        useTool(
          joined && options && fixtureTool.name === "addArc"
            ? createJoinedRootArcTool({ ...options, ...joined })
            : fixtureTool,
        );
      }
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
