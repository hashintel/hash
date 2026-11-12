import { z } from "zod";

import { brunchTools } from "../constants";
import {
  mergeOffers,
  type OfferedQuestions,
  offerBounds,
  offerText,
  questionKinds,
} from "./question-kinds";

const zTextWith = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength);
const asked = {
  label: zTextWith(offerBounds.maxLabelLength).describe(offerText.label),
  text: z.string().trim().min(1).describe(offerText.text),
};
const { choose, values } = questionKinds;

const zOfferedQuestion = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("confirm"), ...asked }),
  z.strictObject({
    kind: z.literal("choose"),
    ...asked,
    options: z
      .array(
        z.strictObject({
          label: zTextWith(choose.bounds.maxLabelLength).describe(
            offerText.optionLabel,
          ),
          value: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe(offerText.optionValue),
        }),
      )
      .min(choose.bounds.min)
      .max(choose.bounds.max)
      .describe(offerText.options),
  }),
  z.strictObject({
    kind: z.literal("values"),
    ...asked,
    fields: z
      .array(
        z.strictObject({
          label: zTextWith(values.bounds.maxLabelLength).describe(
            offerText.fieldLabel,
          ),
          unit: zTextWith(values.bounds.maxUnitLength)
            .optional()
            .describe(offerText.unit),
        }),
      )
      .min(values.bounds.min)
      .max(values.bounds.max)
      .describe(offerText.fields),
  }),
  z.strictObject({ kind: z.literal("open"), ...asked }),
]);

/** The wire form of `OfferedQuestions`, as the model sends it. */
export const zOfferAnswersInput = z.strictObject({
  questions: z
    .array(zOfferedQuestion)
    .min(offerBounds.questions.min)
    .max(offerBounds.questions.max)
    .describe(offerText.questions),
}) satisfies z.ZodType<OfferedQuestions>;

/**
 * The one set of questions a turn asks, read from its message parts across
 * every offer it made. Undefined when it asks none. A server tool's part is
 * named by its type in the browser and by `toolName` elsewhere.
 */
export const offerIn = (
  parts: readonly object[],
): OfferedQuestions | undefined => {
  const offer = mergeOffers(
    parts.flatMap((part) => {
      const named =
        ("type" in part && part.type === `tool-${brunchTools.offerAnswers}`) ||
        ("toolName" in part && part.toolName === brunchTools.offerAnswers);
      if (!named || !("input" in part)) return [];
      const parsed = zOfferAnswersInput.safeParse(part.input);
      return parsed.success ? [parsed.data] : [];
    }),
  );
  return offer.questions.length > 0 ? offer : undefined;
};
