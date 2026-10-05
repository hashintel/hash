import { z } from "zod";

const completionFailureSchema = z.object({
  diagnostic: z.string(),
  nodeId: z.string().optional(),
  kind: z.string().optional(),
  slot: z.string().optional(),
  requirement: z.string(),
  actual: z.string(),
  message: z.string(),
  captureIds: z.array(z.string()),
});

const completionReportSchema = z.object({
  complete: z.boolean(),
  pluginVersion: z.string(),
  revision: z.string(),
  failures: z.array(completionFailureSchema),
  sliceNodeIds: z.array(z.string()),
  outsideSlice: z.array(
    z.object({
      nodeId: z.string(),
      kind: z.string(),
      open: z.array(completionFailureSchema),
    }),
  ),
});

const captureSchema = z.object({
  id: z.string(),
  status: z.enum(["active", "superseded", "retracted"]),
  epistemicStatus: z.string(),
  confidence: z.string(),
  content: z.union([
    z.object({ value: z.unknown() }),
    z.object({ absence: z.string() }),
  ]),
  evidence: z.array(z.object({ excerpt: z.string() })).optional(),
  basis: z
    .object({
      type: z.string(),
      description: z.string(),
    })
    .optional(),
  alternativeGroup: z.string().optional(),
  supersedes: z.string().optional(),
});

/** Shape of the Brunch sweep client tool's output, as read by the app. */
export const sweepOutputSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("no-settled-range") }),
  z.object({
    status: z.literal("refused"),
    refusal: z.object({
      code: z.string(),
      message: z.string(),
    }),
  }),
  z.object({
    status: z.literal("applied"),
    appliedCaptureIds: z.array(z.string()),
    captures: z.array(captureSchema),
    completion: completionReportSchema.optional(),
  }),
]);

export type SweepCompletionFailure = z.infer<typeof completionFailureSchema>;
export type SweepCompletionReport = z.infer<typeof completionReportSchema>;
export type SweepCapture = z.infer<typeof captureSchema>;
