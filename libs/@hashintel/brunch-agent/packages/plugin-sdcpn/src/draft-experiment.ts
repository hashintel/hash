import { z } from "zod";

import { petrinautExperimentRequestSchema } from "@hashintel/petrinaut-core";

import { declaredBasisSchema, sha256Schema } from "./declared-basis";

export const draftPetrinautExperimentToolName = "draft_petrinaut_experiment";

export const isDraftPetrinautExperimentToolName = (name: string): boolean =>
  name === draftPetrinautExperimentToolName;

const nonempty = z.string().min(1);

/**
 * One sentence the person reads beside a setting: the unit and conversion of
 * a numeric field, whether a metric is last-frame, accumulated or peak, that a
 * budget number is agent inference, or what the result must not claim.
 */
const declarationSchema = z.strictObject({
  subject: nonempty.describe(
    "The request field or metric ID the sentence is about, or `result` for what the result must not claim.",
  ),
  statement: nonempty.describe(
    "One plain sentence in the person's vocabulary. Name units and conversions; label a non-objective metric 'reported, not enforced'; call a chosen budget number agent inference.",
  ),
});

/** A workpiece condition the request cannot carry, disclosed rather than dropped. */
const unsupportedConditionSchema = z.strictObject({
  condition: nonempty.describe(
    "The restriction, threshold or condition in the person's words.",
  ),
  reason: nonempty.describe(
    "One line on why the request cannot carry it. The request carries no constraints and no constraint policy, so no restriction is enforced.",
  ),
  reportedByMetricId: nonempty
    .optional()
    .describe(
      "A saved metric in `experiment.metricIds` that observes this condition. It is reported beside the result, never enforced.",
    ),
});

/**
 * The drafted proposal. `experiment` is core's request, unchanged and
 * separable; the other fields are Brunch's provenance and disclosure.
 */
export const draftPetrinautExperimentInputSchema = z
  .strictObject({
    observation: z
      .strictObject({
        toolCallId: nonempty.describe(
          "The read_petrinaut_net call whose output supplied every identifier below.",
        ),
        baseHash: sha256Schema.describe(
          "That read's `observation.sha256`; the model the identifiers were copied from.",
        ),
      })
      .describe(
        "The verified current net observation the identifiers were copied from.",
      ),
    experiment: petrinautExperimentRequestSchema.describe(
      "The experiment to draft, in Petrinaut's own request shape. Copy `scenarioId`, `metricIds`, `objectiveMetricId` and scenario parameter identifiers from the cited observation; do not compose them from names. Drafting does not run it.",
    ),
    declarations: z
      .array(declarationSchema)
      .min(1)
      .describe(
        "Mandatory disclosures the person reads beside the settings: every numeric field's unit and conversion, every metric's kind and role, every budget number's inference, and what the result must not claim.",
      ),
    basis: declaredBasisSchema.describe(
      "The settled workpiece passages the experiment derives from, in the same declared-basis shape mutate_petrinaut_net uses.",
    ),
    unsupported: z
      .array(unsupportedConditionSchema)
      .describe(
        "Every restriction, threshold or condition the request cannot carry, each with a one-line reason. Empty means the workpiece stated none, not that any is enforced.",
      ),
  })
  .describe(
    "Draft one experiment for this session from the settled workpiece and the current net. The browser prepares it against the live model and shows it as drafted, not run; the person starts it from that card. Call once when readiness is first reached or when the meaningful configuration changes; a later draft supersedes the earlier one.",
  );

export type DraftPetrinautExperimentInput = z.output<
  typeof draftPetrinautExperimentInputSchema
>;

/**
 * What the browser reports back once the proposal has been prepared. Sent
 * once, when preparation finishes; Run and Dismiss happen after it and are not
 * reported through this channel.
 */
export const draftPetrinautExperimentOutputSchema = z.strictObject({
  status: z.enum(["drafted", "invalid"]),
  summary: z.string(),
  diagnostics: z.array(z.string()),
});

export type DraftPetrinautExperimentOutput = z.output<
  typeof draftPetrinautExperimentOutputSchema
>;
