import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";
import {
  normalizePetrinautAiToolInput,
  petrinautAiTools,
} from "@hashintel/petrinaut-core/ai";

import {
  layoutPetrinautNetToolName,
  readPetrinautDiagnosticsToolName,
  readPetrinautNetToolName,
} from "../construction-tool-names";

import type {
  DefinitionObservation,
  ConstructionMutationRequest,
} from "../mutation-record";
import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

/** Settled-revision authority every browser-bound construction tool checks basis against. */
export interface WorkpieceAuthorityOptions {
  readonly currentRevision: WorkpieceRevision | null;
  readonly retainedRevisionFor: (
    revisionId: string,
  ) => Promise<WorkpieceRevision | undefined>;
}

export { layoutPetrinautNetToolName } from "../construction-tool-names";

export const observedDefinitionReadTool = defineTool({
  name: readPetrinautNetToolName,
  description: `${petrinautAiTools.getLatestNetDefinition.description}\nThe browser output also returns observation: copy its toolCallId and sha256 into mutate_petrinaut_net.observation.toolCallId and baseHash. For query_workpiece, copy the same toolCallId into selector.observationToolCallId. These identify this exact document read, not the workpiece. Call in its own proposal and wait for the browser result before using it; obtain a fresh read after any mutation or layout.`,
  input: petrinautAiTools.getLatestNetDefinition.inputSchema,
  output: v.object({ awaiting: v.literal(AWAITING_CLIENT) }),
  run() {
    return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
  },
});

export const observedCompilationReadTool = defineTool({
  name: readPetrinautDiagnosticsToolName,
  description: petrinautAiTools.getNetCompilationErrors.description,
  input: petrinautAiTools.getNetCompilationErrors.inputSchema,
  output: v.object({ awaiting: v.literal(AWAITING_CLIENT) }),
  run() {
    return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
  },
});

/**
 * Canonical Petrinaut ELK layout, executed by the browser as its own recorded
 * command. Its client result carries `metadata.layoutRecord` with the observed
 * pre/post hashes and position effects; the post hash is the next base.
 */
export const observedLayoutCommandTool = defineTool({
  name: layoutPetrinautNetToolName,
  description: `${petrinautAiTools.applyAutoLayout.description}\nLayout is a recorded document mutation, separate from mutate_petrinaut_net. Call it in its own proposal after a batch that added or restructured places or transitions, never after a batch that only changed types, parameters or dynamics. Obtain a fresh read_petrinaut_net after layout and before any further mutation; host-only layout provenance is not model context.`,
  input: petrinautAiTools.applyAutoLayout.inputSchema,
  output: v.object({ awaiting: v.literal(AWAITING_CLIENT) }),
  run() {
    return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
  },
});

/** Resolves an earlier verified browser read so a mutation can cite its exact base. */
export interface ObservedConstructionOptions extends WorkpieceAuthorityOptions {
  readonly observationFor: (
    id: string,
    mutation?: Pick<ConstructionMutationRequest, "toolName" | "input">,
  ) => Promise<DefinitionObservation>;
}

export const PETRINAUT_CONSTRUCTION_TOOL_NAMES = [
  "getLatestNetDefinition",
  "addType",
  "addParameter",
  "addPlace",
  "addTransition",
  "addArc",
] as const satisfies readonly (keyof typeof petrinautAiTools)[];

export type PetrinautConstructionToolName =
  (typeof PETRINAUT_CONSTRUCTION_TOOL_NAMES)[number];

const issuePathFrom = (
  input: Record<string, unknown>,
  path: readonly PropertyKey[],
): [v.IssuePathItem, ...v.IssuePathItem[]] | undefined => {
  if (path.length === 0) return undefined;
  let current: unknown = input;
  return path.map((key) => {
    const parent = current;
    const value =
      typeof parent === "object" && parent !== null
        ? (parent as Record<PropertyKey, unknown>)[key]
        : undefined;
    current = value;
    return {
      type: "unknown" as const,
      origin: "value" as const,
      input: parent,
      key,
      value,
    };
  }) as [v.IssuePathItem, ...v.IssuePathItem[]];
};

const canonicalInputFor = (toolName: PetrinautConstructionToolName) => {
  if (toolName === "addType") {
    const canonical = petrinautAiTools.addType;
    return {
      description: [
        canonical.description,
        "Canonical Petrinaut input JSON Schema:",
        JSON.stringify(canonical.inputSchema.toJSONSchema({ io: "input" })),
      ].join("\n"),
      schema: canonical.inputSchema,
    };
  }
  const canonicalTool = petrinautAiTools[toolName];
  const jsonSchema = canonicalTool.inputSchema.toJSONSchema();
  // Headless construction tools keep a loose carrier and validate canonically below.
  const carrier = v.looseObject({});

  return {
    description: [
      canonicalTool.description,
      ...(toolName === "addArc"
        ? [
            "A finite numeric-string weight is normalized to a number before canonical validation.",
          ]
        : []),
      "Canonical Petrinaut input JSON Schema:",
      JSON.stringify(jsonSchema),
    ].join("\n"),
    schema: v.pipe(
      carrier,
      v.rawTransform((context) => {
        const normalizedInput = normalizePetrinautAiToolInput(
          toolName,
          context.dataset.value,
        );
        const parsed = canonicalTool.inputSchema.safeParse(normalizedInput);
        if (parsed.success) return parsed.data;

        for (const issue of parsed.error.issues) {
          context.addIssue({
            message: issue.message,
            path: issuePathFrom(context.dataset.value, issue.path),
          });
        }
        return context.NEVER;
      }),
    ),
  };
};

const awaitingClientOutput = v.object({
  awaiting: v.literal(AWAITING_CLIENT),
});

const definePetrinautConstructionTool = (
  toolName: PetrinautConstructionToolName,
) => {
  const canonicalInput = canonicalInputFor(toolName);
  return defineTool({
    name: toolName,
    description: canonicalInput.description,
    input: canonicalInput.schema,
    output: awaitingClientOutput,
    run() {
      return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
    },
  });
};

export const petrinautConstructionTools = PETRINAUT_CONSTRUCTION_TOOL_NAMES.map(
  definePetrinautConstructionTool,
);
