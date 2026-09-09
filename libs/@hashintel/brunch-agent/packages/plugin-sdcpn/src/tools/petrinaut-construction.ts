import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";
import {
  normalizePetrinautAiToolInput,
  petrinautAiTools,
} from "@hashintel/petrinaut-core/ai";

import { validateDeclaredBasis } from "../declared-basis";
import { joinedRootArcInputSchema, observedArcInputSchema } from "../root-arc";
import { isObservedNodeMutation, observedNodeInputSchema } from "../root-node";

import type {
  DefinitionObservation,
  ArcMutationRequest,
  ConstructionMutationRequest,
} from "../transition-record";
import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

export { joinedRootArcInputSchema } from "../root-arc";

/** The only joined mutation; inherited headless tools are not newly admitted. */
export const createJoinedRootArcTool = (options: {
  currentRevision: WorkpieceRevision | null;
  retainedRevisionFor: (
    revisionId: string,
  ) => Promise<WorkpieceRevision | undefined>;
  binding: ArcMutationRequest["binding"];
  requestedBaseHash: string;
}) =>
  defineTool({
    name: "addArc",
    description: `${petrinautAiTools.addArc.description}\nRoot place arcs only. Cite a settled workpiece in brunch.basis and the issued brunch.requestedBaseHash. Numeric-string weights normalize before structural and canonical validation.`,
    input: joinedRootArcInputSchema,
    prepareArguments: (input) => normalizePetrinautAiToolInput("addArc", input),
    output: v.object({ awaiting: v.literal(AWAITING_CLIENT) }),
    async run({ data }) {
      if (data.brunch.requestedBaseHash !== options.requestedBaseHash)
        throw new Error("The arc does not cite the issued browser base.");
      await validateDeclaredBasis(
        data.brunch.basis,
        options.currentRevision,
        options.retainedRevisionFor,
      );
      return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
    },
  });

export { observedConstructionBrowserToolNames } from "../root-arc";

export const observedDefinitionReadTool = defineTool({
  name: "getLatestNetDefinition",
  description: petrinautAiTools.getLatestNetDefinition.description,
  input: petrinautAiTools.getLatestNetDefinition.inputSchema,
  output: v.object({ awaiting: v.literal(AWAITING_CLIENT) }),
  run() {
    return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
  },
});

export const observedCompilationReadTool = defineTool({
  name: "getNetCompilationErrors",
  description: petrinautAiTools.getNetCompilationErrors.description,
  input: petrinautAiTools.getNetCompilationErrors.inputSchema,
  output: v.object({ awaiting: v.literal(AWAITING_CLIENT) }),
  run() {
    return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
  },
});

export const createObservedArcTool = (
  name: ConstructionMutationRequest["toolName"],
  options: {
    currentRevision: WorkpieceRevision | null;
    retainedRevisionFor: (id: string) => Promise<WorkpieceRevision | undefined>;
    observationFor: (
      id: string,
      mutation?: Pick<ConstructionMutationRequest, "toolName" | "input">,
    ) => Promise<DefinitionObservation>;
  },
) =>
  defineTool({
    name,
    description: `${petrinautAiTools[name].description}\nRoot construction only. Cite an earlier verified browser result's observationToolCallId and exact raw requestedBaseHash, and explicit settled brunch.basis.`,
    input: isObservedNodeMutation(name)
      ? observedNodeInputSchema(name)
      : observedArcInputSchema(name),
    prepareArguments: (input) => normalizePetrinautAiToolInput(name, input),
    output: v.object({ awaiting: v.literal(AWAITING_CLIENT) }),
    async run({ data }) {
      if (!options.currentRevision)
        throw new Error("Settle the workpiece before construction.");
      await validateDeclaredBasis(
        data.brunch.basis,
        options.currentRevision,
        options.retainedRevisionFor,
      );
      const { brunch, ...input } = data;
      const observed = await options.observationFor(
        brunch.observationToolCallId,
        { toolName: name, input },
      );
      if (observed.sha256 !== data.brunch.requestedBaseHash)
        throw new Error(
          "Mutation base differs from the earlier verified browser observation.",
        );
      return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
    },
  });

export const PETRINAUT_CONSTRUCTION_TOOL_NAMES = [
  "getLatestNetDefinition",
  "addType",
  "addParameter",
  "addPlace",
  "addTransition",
  "addArc",
] as const satisfies readonly (keyof typeof petrinautAiTools)[];

export const petrinautFixtureToolNames = [
  "getLatestNetDefinition",
  "addArc",
] as const satisfies readonly (keyof typeof petrinautAiTools)[];

export type PetrinautConstructionToolName =
  (typeof PETRINAUT_CONSTRUCTION_TOOL_NAMES)[number];
type PetrinautFixtureToolName = (typeof petrinautFixtureToolNames)[number];

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
  // Unjoined legacy/headless classes retain their original loose validation path.
  // This does not admit any new class.
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

const isPetrinautFixtureTool = (
  tool: (typeof petrinautConstructionTools)[number],
): tool is (typeof petrinautConstructionTools)[number] & {
  readonly name: PetrinautFixtureToolName;
} =>
  petrinautFixtureToolNames.some((fixtureToolName) => {
    return fixtureToolName === tool.name;
  });

export const petrinautFixtureTools = petrinautConstructionTools.filter(
  isPetrinautFixtureTool,
);
