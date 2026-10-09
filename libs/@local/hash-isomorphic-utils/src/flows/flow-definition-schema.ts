import { z } from "zod";

import type {
  FlowDefinition,
  PayloadKind,
  StepDefinition,
  StepInputSource,
} from "./types.js";

/**
 * How a value of each payload kind is represented in JSON, for checking constants.
 */
export const payloadKindJsonTypes = {
  ActorType: "string",
  Boolean: "boolean",
  Date: "string",
  EntityId: "string",
  FailedEntityProposal: "object",
  FormattedText: "object",
  GoogleAccountId: "string",
  GoogleSheet: "object",
  Number: "number",
  PersistedEntityMetadata: "object",
  ProposedEntity: "object",
  ProposedEntityWithResolvedLinks: "object",
  Text: "string",
  VersionedUrl: "string",
  WebPage: "object",
  WebSearchResult: "object",
} as const satisfies Record<
  PayloadKind,
  "string" | "number" | "boolean" | "object"
>;

const payloadKindSchema = z.enum(
  Object.keys(payloadKindJsonTypes) as [PayloadKind, ...PayloadKind[]],
);

const connectionOptionsShape = {
  access: z.enum(["read", "consume"]).optional(),
  wrap: z.literal(true).optional(),
  whenMissing: z.literal("skip").optional(),
};

const stepInputSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("flow-input"),
    inputName: z.string(),
    ...connectionOptionsShape,
  }),
  z.strictObject({
    kind: z.literal("step-output"),
    stepId: z.string(),
    outputName: z.string(),
    ...connectionOptionsShape,
  }),
  z.strictObject({
    kind: z.literal("item"),
    ...connectionOptionsShape,
  }),
  z.strictObject({
    kind: z.literal("constant"),
    payload: z.strictObject({ kind: payloadKindSchema, value: z.unknown() }),
  }),
]) satisfies z.ZodType<StepInputSource>;

/*
 * Action ids are typed as strings here, because a definition from outside the codebase may name one that
 * doesn't exist: `validateFlowDefinition` reports it against the step that uses it.
 */
const stepDefinitionSchema: z.ZodType<StepDefinition<string>> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("action"),
      stepId: z.string().min(1),
      actionDefinitionId: z.string(),
      description: z.string(),
      inputs: z.record(z.string(), stepInputSourceSchema),
      retryCount: z.int().nonnegative().optional(),
    }),
    z.strictObject({
      kind: z.literal("for-each"),
      stepId: z.string().min(1),
      description: z.string(),
      over: stepInputSourceSchema,
      steps: z.array(stepDefinitionSchema),
      collect: z.strictObject({
        stepId: z.string(),
        outputName: z.string(),
        as: z.string().min(1),
      }),
    }),
  ]),
);

export const flowDefinitionSchema = z.strictObject({
  name: z.string(),
  description: z.string(),
  inputs: z.array(
    z.strictObject({
      name: z.string().min(1),
      payloadKind: payloadKindSchema,
      array: z.boolean(),
      required: z.boolean(),
      label: z.string().optional(),
      description: z.string().optional(),
    }),
  ),
  steps: z.array(stepDefinitionSchema),
  outputs: z.array(
    z.strictObject({
      name: z.string().min(1),
      stepId: z.string(),
      outputName: z.string(),
      description: z.string().optional(),
    }),
  ),
}) satisfies z.ZodType<FlowDefinition<string>>;
