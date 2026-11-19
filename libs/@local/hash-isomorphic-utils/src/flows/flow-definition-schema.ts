import { z } from "zod";

import { stepRunIdSeparator } from "./step-run-id.js";
import { allPayloadKinds } from "./types.js";

import type {
  FlowDefinition,
  StepDefinition,
  StepInputSource,
} from "./types.js";

const payloadKindSchema = z.enum(allPayloadKinds);

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
  .refine((stepId) => !stepId.includes(stepRunIdSeparator), {
    message: `A step id cannot contain "${stepRunIdSeparator}"`,
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

const stepDefinitionBaseShape = {
  stepId: stepIdSchema,
  position: z.strictObject({ x: z.number(), y: z.number() }).optional(),
  runAfter: z
    .array(
      z.strictObject({
        stepId: stepIdSchema,
        outputName: z.string().optional(),
      }),
    )
    .optional(),
};

/*
 * Action ids are typed as strings here, because a definition from outside the codebase may name one that
 * doesn't exist: `validateFlowDefinition` reports it against the step that uses it.
 */
const stepDefinitionSchema: z.ZodType<StepDefinition<string>> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("action"),
      ...stepDefinitionBaseShape,
      actionDefinitionId: z.string(),
      description: z.string(),
      inputs: z.record(z.string(), stepInputSourceSchema),
      retryCount: z.int().nonnegative().optional(),
      pathNames: z.record(z.string(), z.string()).optional(),
    }),
    z.strictObject({
      kind: z.literal("for-each"),
      ...stepDefinitionBaseShape,
      description: z.string(),
      over: stepInputSourceSchema,
      steps: z.array(stepDefinitionSchema),
      collect: z.strictObject({
        stepId: stepIdSchema,
        outputName: z.string(),
        as: z.string(),
      }),
    }),
  ]),
);

/** Names may be empty, so that a half-built flow can be saved: `validateFlowDefinition` reports them. */
export const flowDefinitionSchema = z.strictObject({
  name: z.string(),
  description: z.string(),
  inputs: z.array(
    z.strictObject({
      name: z.string(),
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
      name: z.string(),
      stepId: stepIdSchema,
      outputName: z.string(),
      description: z.string().optional(),
    }),
  ),
}) satisfies z.ZodType<FlowDefinition<string>>;
