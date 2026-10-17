import { z } from "zod";

import type {
  FlowDefinition,
  PayloadKind,
  payloadKindPrimitives,
  StepDefinition,
  StepInputSource,
} from "./types.js";

/**
 * How a value of each payload kind is represented in JSON, for checking constants. A kind with a primitive type must
 * have that primitive's JSON type.
 */
export const payloadKindJsonTypes = {
  ActorType: "string",
  Aggregation: "object",
  Boolean: "boolean",
  Date: "string",
  DateTime: "string",
  Duration: "object",
  EntityId: "string",
  FailedEntityProposal: "object",
  FilterCondition: "object",
  FormattedText: "object",
  GoogleAccountId: "string",
  GoogleSheet: "object",
  Number: "number",
  PersistedEntityMetadata: "object",
  ProposedEntity: "object",
  ProposedEntityWithResolvedLinks: "object",
  SortKey: "object",
  Text: "string",
  VersionedUrl: "string",
  WebPage: "object",
  WebSearchResult: "object",
} as const satisfies {
  [Kind in PayloadKind]: (typeof payloadKindPrimitives)[Kind] extends null
    ? "string" | "number" | "boolean" | "object"
    : (typeof payloadKindPrimitives)[Kind] extends "number" | "boolean"
      ? (typeof payloadKindPrimitives)[Kind]
      : "string";
};

const payloadKindSchema = z.enum(
  Object.keys(payloadKindJsonTypes) as [PayloadKind, ...PayloadKind[]],
);

const connectionOptionsShape = {
  access: z.enum(["read", "consume"]).optional(),
  wrap: z.literal(true).optional(),
  whenMissing: z.literal("skip").optional(),
};

/**
 * The engine names the steps in each branch of a for-each step `<stepId>~<item index>`, so `~` can't be part of a
 * step id.
 */
const stepIdSchema = z
  .string()
  .min(1)
  .refine((stepId) => !stepId.includes("~"), {
    message: 'A step id cannot contain "~"',
  });

const stepInputSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("flow-input"),
    inputName: z.string(),
    ...connectionOptionsShape,
  }),
  z.strictObject({
    kind: z.literal("step-output"),
    stepId: stepIdSchema,
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
      stepId: stepIdSchema,
      actionDefinitionId: z.string(),
      description: z.string(),
      inputs: z.record(z.string(), stepInputSourceSchema),
      retryCount: z.int().nonnegative().optional(),
    }),
    z.strictObject({
      kind: z.literal("for-each"),
      stepId: stepIdSchema,
      description: z.string(),
      over: stepInputSourceSchema,
      steps: z.array(stepDefinitionSchema),
      collect: z.strictObject({
        stepId: stepIdSchema,
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
      stepId: stepIdSchema,
      outputName: z.string(),
      description: z.string().optional(),
    }),
  ),
}) satisfies z.ZodType<FlowDefinition<string>>;
