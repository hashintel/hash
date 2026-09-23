import { z } from "zod";

import { petrinautExperimentRequestSchema } from "@hashintel/petrinaut-core";

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

/** Core's AI request schema has no constraints field. Preparation currently forwards
 * constraints: [] and constraintPolicy: null downstream; that is not AI constraint carriage.
 * A workpiece condition is disclosed rather than silently dropped. */
const unsupportedConditionSchema = z.strictObject({
  condition: nonempty.describe(
    "The restriction, threshold or condition in the person's words.",
  ),
  reason: nonempty.describe(
    "One line on why the request cannot carry it. The request carries no constraints and no constraint policy, so no restriction is enforced.",
  ),
  blocksRun: z
    .boolean()
    .default(true)
    .describe(
      "True for a hard or load-bearing restriction: Run stays unavailable. False only when the person explicitly accepts a reporting-only exploration without enforcing this condition. Omission blocks Run.",
    ),
  reportedByMetricId: nonempty
    .optional()
    .describe(
      "A saved metric in `experiment.metricIds` that observes this condition. It is reported beside the result, never enforced.",
    ),
});

/**
 * The drafted proposal. `experiment` is core's request, unchanged and
 * separable; the other fields disclose the proposal, not host protocol identity.
 */
export const draftPetrinautExperimentInputSchema = z
  .strictObject({
    experiment: petrinautExperimentRequestSchema.describe(
      "The experiment to draft, in Petrinaut's own request shape. Use identifiers from the verified current canonical getLatestNetDefinition result; the host resolves and verifies that read, not a model-supplied hash or call ID. Drafting does not run it.",
    ),
    declarations: z
      .array(declarationSchema)
      .min(1)
      .describe(
        "Mandatory disclosures the person reads beside the settings: every numeric field's unit and conversion, every metric's kind and role, every budget number's inference, and what the result must not claim.",
      ),
    unsupported: z
      .array(unsupportedConditionSchema)
      .describe(
        "Every restriction, threshold or condition the request cannot carry, each with a one-line reason. Empty means the workpiece stated none, not that any is enforced.",
      ),
  })
  .superRefine((draft, context) => {
    for (const [index, condition] of draft.unsupported.entries()) {
      if (
        condition.reportedByMetricId &&
        !draft.experiment.metricIds.includes(condition.reportedByMetricId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["unsupported", index, "reportedByMetricId"],
          message:
            "A reporting metric must be included in experiment.metricIds.",
        });
      }
    }
  })
  .describe(
    "Draft one experiment for this conversation from the settled Ledger and the verified current canonical net read. The browser prepares it against the live model and shows it as drafted, not run; the person starts it from that card. Call once when readiness is first reached or when the meaningful configuration changes; a later draft supersedes the earlier one.",
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
