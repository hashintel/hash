import { z } from "zod";

import {
  type OfferedQuestions,
  offerBounds,
  offersAnswers,
  offerText,
  questionKinds,
} from "./question-kinds/kinds";

const text = (maxLength: number) => z.string().trim().min(1).max(maxLength);
const label = text(offerBounds.maxLabelLength).describe(offerText.label);
const { choose, values } = questionKinds;

const zOfferedQuestion = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("confirm"), label }),
  z.strictObject({
    kind: z.literal("choose"),
    label,
    options: z
      .array(text(choose.bounds.maxLength))
      .min(choose.bounds.min)
      .max(choose.bounds.max)
      .describe(offerText.options),
  }),
  z.strictObject({
    kind: z.literal("values"),
    label,
    fields: z
      .array(
        z.strictObject({
          label: text(values.bounds.maxLabelLength).describe(
            offerText.fieldLabel,
          ),
          unit: text(values.bounds.maxUnitLength)
            .optional()
            .describe(offerText.unit),
        }),
      )
      .min(values.bounds.min)
      .max(values.bounds.max)
      .describe(offerText.fields),
  }),
  z.strictObject({ kind: z.literal("open"), label }),
]);

/** The wire form of `OfferedQuestions`, as the model sends it. */
export const zOfferAnswersInput = z.strictObject({
  questions: z
    .array(zOfferedQuestion)
    .min(offerBounds.questions.min)
    .max(offerBounds.questions.max)
    .refine((questions) => offersAnswers({ questions }), {
      message: "At least one question must not be open.",
    })
    .describe(offerText.questions),
}) satisfies z.ZodType<OfferedQuestions>;

export type OfferAnswersInput = z.output<typeof zOfferAnswersInput>;
