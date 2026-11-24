/**
 * The HTTP body through which a panel reports that the user edited the net
 * by hand, under `<agent>/<brunchRoutes.browserCalls>/<brunchRoutes.handEdits>`.
 * The server admits each report once, as a note the model reads.
 */

import * as v from "valibot";

/**
 * A report: the reporting tab's canonical editor binding, the edit episode
 * it belongs to, the report's position in it, and the document's revision.
 * The episode is bounded because it enters the note's request ID.
 */
export const handEditReportBodySchema = v.object({
  binding: v.string(),
  episode: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  seq: v.pipe(v.number(), v.integer(), v.minValue(0)),
  revision: v.pipe(v.string(), v.minLength(1)),
});

export type HandEditReportBody = v.InferOutput<typeof handEditReportBodySchema>;
