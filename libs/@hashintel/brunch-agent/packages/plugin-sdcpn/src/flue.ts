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
} from "@hashintel/brunch-agent/workpiece";
import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
} from "@hashintel/petrinaut-core/ai";

import { sha256Pattern } from "./declared-basis";
import { batchedConstructionMode } from "./mutate-petrinet";
import sdcpnAppend from "./prompts/APPEND_SYSTEM.md?raw";
import { browserBindingSchema, conversationConstructionMode } from "./root-arc";
import {
  SDCPN_MODELLING_SKILL_NAME,
  sdcpnModellingSkill,
} from "./skills/sdcpn-modelling/skill";
import { createMutatePetrinetTool } from "./tools/mutate-petrinet";
import {
  createJoinedRootArcTool,
  createObservedArcTool,
  observedDefinitionReadTool,
  observedCompilationReadTool,
  observedConstructionBrowserToolNames,
  petrinautConstructionTools,
  petrinautFixtureTools,
  type ObservedConstructionOptions,
  type WorkpieceAuthorityOptions,
} from "./tools/petrinaut-construction";
import {
  READ_PETRINAUT_DOC_TOOL_NAME,
  readPetrinautDoc,
} from "./tools/read-petrinaut-doc";

export { conversationConstructionMode } from "./root-arc";
export const VALIDATED_CONSTRUCTION_MODE = "validated-construction";
export {
  batchedConstructionMode,
  mutatePetrinetToolName,
} from "./mutate-petrinet";
export const validatedFixtureMutationMode = preparedWorkpieceInitialDataMode;

/** Signal appended at agent start carrying the conversation-bound construction binding. */
export const CONSTRUCTION_BINDING_SIGNAL_TYPE = "brunch.construction-binding";
/** Signal appended at agent start carrying the joined prepared-fixture browser context. */
export const CONSTRUCTION_CONTEXT_SIGNAL_TYPE = "brunch.construction-context";

export const sdcpnInitialDataSchema = v.optional(
  v.pipe(
    v.object({
      mode: v.picklist([
        VALIDATED_CONSTRUCTION_MODE,
        validatedFixtureMutationMode,
        conversationConstructionMode,
        batchedConstructionMode,
      ]),
      construction: v.optional(
        v.strictObject({ binding: browserBindingSchema }),
      ),
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
    v.check(
      (data) =>
        data.mode === conversationConstructionMode ||
        data.mode === batchedConstructionMode
          ? data.construction !== undefined && data.browser === undefined
          : data.construction === undefined,
      "Construction requires a distinct immutable binding and mode.",
    ),
  ),
);

export type SdcpnInitialData = v.InferOutput<typeof sdcpnInitialDataSchema>;

type SdcpnInitialDataFields = NonNullable<SdcpnInitialData>;

/**
 * The browser the agent is bound to: the immutable binding, plus the issued
 * base for the legacy joined prepared-fixture tracer, or the `construction`
 * marker for the conversation-construction candidate.
 */
export type BrowserContext = Pick<
  NonNullable<SdcpnInitialDataFields["browser"]>,
  "binding"
> &
  Partial<
    Pick<NonNullable<SdcpnInitialDataFields["browser"]>, "requestedBaseHash">
  > & { readonly construction?: true };

/** Mount the prompt material, skill, and conditional tools owned by the SDCPN plugin. */
export function useSdcpnPlugin(
  options?: WorkpieceAuthorityOptions &
    Partial<Pick<ObservedConstructionOptions, "observationFor">>,
): void {
  const initialData = useInitialData<SdcpnInitialData>();
  const delivery = useDelivery();

  useInstruction(sdcpnAppend.trim());
  useSkill(sdcpnModellingSkill);
  useTool(readPetrinautDoc);

  if (initialData?.mode === batchedConstructionMode) {
    if (!initialData.construction || !options?.observationFor)
      throw new Error("Batched construction requires authorized observations.");
    useInstruction(
      "Construction uses three strictly separate proposals. Proposal 1 contains only required skill-resource reads and other server tools; wait for every result. Proposal 2 contains only getLatestNetDefinition; wait for its browser result. Proposal 3 contains only mutate_petrinet; wait for its browser result. Use one bounded ordered construction chunk and do not call individual mutation tools. Cite the exact observation tool-call ID and base hash. Deduplicate settled bases, assign each a basisId, and put a mandatory basisId on every operation as a sibling of operationId, type and input. Give every operation a unique operationId. Only root addPlace, addTransition, addArc, removePlace, removeTransition, removeArc, addType, addParameter, and addDifferentialEquation are available in this candidate mode. removePlace also removes connected arcs. Operations commit in order; failure leaves the later suffix unattempted.",
    );
    useTool(observedDefinitionReadTool);
    useTool(
      createMutatePetrinetTool({
        ...options,
        observationFor: options.observationFor,
      }),
    );
  } else if (initialData?.mode === conversationConstructionMode) {
    if (!initialData.construction || !options?.observationFor)
      throw new Error(
        "Conversation construction requires authorized observations.",
      );
    useAgentStart(({ append }) =>
      append({
        kind: "signal",
        type: CONSTRUCTION_BINDING_SIGNAL_TYPE,
        tagName: CONSTRUCTION_BINDING_SIGNAL_TYPE,
        body: JSON.stringify(initialData.construction),
      }),
    );
    useInstruction(
      "This is a synthetic candidate conversation-bound construction path, not provider-class or genuine construction admission. No prepared workpiece is supplied. Elicit and settle the actual workpiece via update_workpiece. Use brunch_workpiece to obtain source IDs and settled passage locators. Before each mutation obtain getLatestNetDefinition and cite its result metadata.observation.toolCallId and metadata.observation.observed.sha256 as brunch.observationToolCallId and brunch.requestedBaseHash, alongside explicit settled basis. Never infer a latest/sibling base or reconstruct one at execution. Root places and transitions can be created/corrected with addPlace/updatePlace/addTransition/updateTransition, connected with addArc and corrected with updateArcWeight; addParameter supplies a root net-level parameter with its native declared default, and addDifferentialEquation supplies one root native continuous-dynamics definition, while addType/updateType, addTypeElement/updateTypeElement and addScenario/updateScenario supply typed-state and labelled scenario construction. Nested elements are ordered attributes, not an invented inventory. Structural element edits migrate per_place scenario rows; those derived cells do not inherit basis. Scenario field queries may use an entity-relative JSON pointer; type-element queries also name the parent type. Omit parameterOverrides when unused. getNetCompilationErrors checks canonical compilation, not scenario execution or simulation; disclose warnings and behavioral limits after consequential correction. Other required operations remain unavailable and must be disclosed, never silently replaced. Duplicate and known-retired identities are refused from verified document/history. Generated or sanitized fields are recorded as derived, not automatically supported by the request basis. Preserve unknown operational quantities; do not invent rates to satisfy compilation. Submit one browser call per proposal and wait for its result; stale, unknown, conflicting, failed and no-op attempts are not causes and must not be reapplied.",
    );
    for (const name of observedConstructionBrowserToolNames)
      useTool(
        name === getLatestNetDefinitionToolName
          ? observedDefinitionReadTool
          : name === getNetCompilationErrorsToolName
            ? observedCompilationReadTool
            : createObservedArcTool(name, {
                ...options,
                observationFor: options.observationFor,
              }),
      );
  } else if (initialData?.mode === VALIDATED_CONSTRUCTION_MODE) {
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
          type: CONSTRUCTION_CONTEXT_SIGNAL_TYPE,
          tagName: CONSTRUCTION_CONTEXT_SIGNAL_TYPE,
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
  observedConstructionBrowserToolNames,
  petrinautFixtureToolNames,
  petrinautConstructionTools,
  petrinautFixtureTools,
  type PetrinautConstructionToolName,
} from "./tools/petrinaut-construction";
