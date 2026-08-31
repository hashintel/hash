import * as v from "valibot";

export { AskInput } from "./ask-tool-contract";

/** The first baseline affordance carried by the walking skeleton (spec §7.2). */
export const FreeTextAffordance = v.object({
  id: v.pipe(v.string(), v.nonEmpty()),
  form: v.literal("free-text"),
  markdown: v.pipe(v.string(), v.nonEmpty()),
  payload: v.object({
    question: v.pipe(v.string(), v.nonEmpty()),
  }),
});

export type FreeTextAffordance = v.InferOutput<typeof FreeTextAffordance>;
