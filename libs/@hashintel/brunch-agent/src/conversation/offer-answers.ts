import { z } from "zod";

import {
  type OfferedQuestions,
  offerBounds,
  offersAnswers,
  offerText,
  questionKinds,
} from "./question-kinds";

const zTextWith = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength);
const zLabel = zTextWith(offerBounds.maxLabelLength).describe(offerText.label);
const { choose, values } = questionKinds;

const zOfferedQuestion = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("confirm"), label: zLabel }),
  z.strictObject({
    kind: z.literal("choose"),
    label: zLabel,
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
    label: zLabel,
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
  z.strictObject({ kind: z.literal("open"), label: zLabel }),
]);

/** The wire form of `OfferedQuestions`, as the model sends it. */
export const zOfferAnswersInput = z.strictObject({
  questions: z
    .array(zOfferedQuestion)
    .min(offerBounds.questions.min)
    .max(offerBounds.questions.max)
    .refine((questions) => offersAnswers({ questions }), {
      message:
        "Every question is open, so there is nothing to offer: don't call offer_answers for this reply.",
    })
    .describe(offerText.questions),
}) satisfies z.ZodType<OfferedQuestions>;
