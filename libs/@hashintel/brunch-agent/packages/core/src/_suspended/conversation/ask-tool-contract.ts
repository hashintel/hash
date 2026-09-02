import * as v from "valibot";

/** The model-facing input contract for the harness-owned ask operation. */
export const AskInput = v.object({
  question: v.pipe(v.string(), v.nonEmpty()),
});

/** The host-authored output contract for one answered ask operation. */
export const AskSubmission = v.object({
  answer: v.pipe(v.string(), v.nonEmpty()),
});
