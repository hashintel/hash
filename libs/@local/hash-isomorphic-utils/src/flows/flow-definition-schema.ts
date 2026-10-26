import { z } from "zod";

import { stepRunIdSeparator } from "./step-run-id.js";
import { allPayloadKinds } from "./types.js";

import type {
  FlowDefinition,
  StepDefinition,
  StepInputSource,
} from "./types.js";

const payloadKindSchema = z.enum(allPayloadKinds);

const connectionOptions = {
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

const flowInputSourceSchema = z.strictObject({
  kind: z.literal("flow-input"),
  inputName: z.string(),
  ...connectionOptions,
});

const stepOutputSourceSchema = z.strictObject({
  kind: z.literal("step-output"),
  stepId: stepIdSchema,
  outputName: z.string(),
  ...connectionOptions,
});

const itemSourceSchema = z.strictObject({
  kind: z.literal("item"),
  ...connectionOptions,
});

const constantPayloadSchema = z.strictObject({
  kind: payloadKindSchema,
  value: z.unknown(),
});

const constantSourceSchema = z.strictObject({
  kind: z.literal("constant"),
  payload: constantPayloadSchema,
});

const stepInputSourceSchema = z.discriminatedUnion("kind", [
  flowInputSourceSchema,
  stepOutputSourceSchema,
  itemSourceSchema,
  constantSourceSchema,
]) satisfies z.ZodType<StepInputSource>;

/*
 * Action ids are typed as strings here, because a definition from outside the codebase may name one that
 * doesn't exist: `validateFlowDefinition` reports it against the step that uses it.
 */
const actionStepDefinitionSchema = z.strictObject({
  kind: z.literal("action"),
  stepId: stepIdSchema,
  actionDefinitionId: z.string(),
  description: z.string(),
  inputs: z.record(z.string(), stepInputSourceSchema),
  retryCount: z.int().nonnegative().optional(),
});

const forEachCollectSchema = z.strictObject({
  stepId: stepIdSchema,
  outputName: z.string(),
  as: z.string().min(1),
});

const stepDefinitionSchema: z.ZodType<StepDefinition<string>> = z.lazy(() => {
  const forEachStepDefinitionSchema = z.strictObject({
    kind: z.literal("for-each"),
    stepId: stepIdSchema,
    description: z.string(),
    over: stepInputSourceSchema,
    steps: z.array(stepDefinitionSchema),
    collect: forEachCollectSchema,
  });

  return z.discriminatedUnion("kind", [
    actionStepDefinitionSchema,
    forEachStepDefinitionSchema,
  ]);
});

const flowInputSchema = z.strictObject({
  name: z.string().min(1),
  payloadKind: payloadKindSchema,
  array: z.boolean(),
  required: z.boolean(),
  label: z.string().optional(),
  description: z.string().optional(),
});

const flowOutputSchema = z.strictObject({
  name: z.string().min(1),
  stepId: stepIdSchema,
  outputName: z.string(),
  description: z.string().optional(),
});

export const flowDefinitionSchema = z.strictObject({
  name: z.string(),
  description: z.string(),
  inputs: z.array(flowInputSchema),
  steps: z.array(stepDefinitionSchema),
  outputs: z.array(flowOutputSchema),
}) satisfies z.ZodType<FlowDefinition<string>>;
