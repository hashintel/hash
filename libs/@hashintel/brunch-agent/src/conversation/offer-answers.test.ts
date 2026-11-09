import { describe, expect, expectTypeOf, test } from "vitest";

import {
  brunchTools,
  type OfferAnswersInput,
  type OfferedQuestions,
  zOfferAnswersInput,
} from "../index";
import { offerBounds, offerText, questionKinds } from "./question-kinds/kinds";

const quarantine = {
  kind: "choose",
  label: "Quarantined shipment",
  options: ["Stays counted as open", "Drops out until released"],
} as const;
const demand = { kind: "confirm", label: "Production demand" } as const;
/** Case 9 of the P0 set: the opening battery, with a card only for appetite. */
const opening = {
  questions: [
    { kind: "open", label: "Summer peak case" },
    { kind: "open", label: "Model boundary" },
    { kind: "open", label: "What else judges it" },
    {
      kind: "choose",
      label: "Time to spend",
      options: ["Quick", "Standard", "Thorough", "Deep"],
    },
  ],
};

describe("offer_answers input", () => {
  test("names the tool", () => {
    expect(brunchTools.offerAnswers).toBe("offer_answers");
  });

  test.each([
    ["a single choose", { questions: [quarantine] }],
    ["a single confirm", { questions: [demand] }],
    ["the opening battery", opening],
  ])("accepts %s", (_name, input) => {
    expect(zOfferAnswersInput.parse(input)).toEqual(input);
  });

  test.each([
    [
      "only open questions",
      { questions: [{ kind: "open", label: "Walk me through it" }] },
    ],
    [
      "a choose with one option",
      { questions: [{ ...quarantine, options: ["Stays counted as open"] }] },
    ],
    ["five questions", { questions: Array.from({ length: 5 }, () => demand) }],
    ["an unknown key", { questions: [{ ...demand, mark: "clicked" }] }],
    ["an empty label", { questions: [{ ...demand, label: "  " }] }],
    [
      "an empty option",
      {
        questions: [{ ...quarantine, options: ["Stays counted as open", ""] }],
      },
    ],
    ["no questions", { questions: [] }],
  ])("rejects %s", (_name, input) => {
    expect(zOfferAnswersInput.safeParse(input).success).toBe(false);
  });

  test("tells a model that offers only open questions not to call the tool", () => {
    const result = zOfferAnswersInput.safeParse({
      questions: [{ kind: "open", label: "Walk me through it" }],
    });
    expect(result.error?.issues.map(({ message }) => message)).toEqual([
      expect.stringContaining("don't call offer_answers"),
    ]);
  });

  test("exports a JSON Schema with every question kind", () => {
    const jsonSchema = zOfferAnswersInput["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    }) as {
      type?: string;
      required?: string[];
      properties?: {
        questions?: { items?: { oneOf?: { properties?: object }[] } };
      };
    };
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.required).toEqual(["questions"]);
    expect(
      jsonSchema.properties?.questions?.items?.oneOf?.map(
        (question) => question.properties,
      ),
    ).toEqual([
      expect.objectContaining({ kind: { type: "string", const: "confirm" } }),
      expect.objectContaining({ kind: { type: "string", const: "choose" } }),
      expect.objectContaining({ kind: { type: "string", const: "values" } }),
      expect.objectContaining({ kind: { type: "string", const: "open" } }),
    ]);
  });

  test("parses exactly the domain's question shape", () => {
    expectTypeOf<OfferAnswersInput>().toEqualTypeOf<OfferedQuestions>();
  });

  test("tells the model what each field means, with the domain's bounds", () => {
    const jsonSchema = zOfferAnswersInput["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });
    expect(jsonSchema).toMatchObject({
      properties: {
        questions: {
          description: offerText.questions,
          maxItems: offerBounds.questions.max,
          items: {
            oneOf: [
              { properties: { label: { description: offerText.label } } },
              {
                properties: {
                  options: {
                    description: offerText.options,
                    minItems: questionKinds.choose.bounds.min,
                    maxItems: questionKinds.choose.bounds.max,
                  },
                },
              },
              {
                properties: {
                  fields: {
                    description: offerText.fields,
                    maxItems: questionKinds.values.bounds.max,
                    items: {
                      properties: {
                        label: { description: offerText.fieldLabel },
                        unit: { description: offerText.unit },
                      },
                    },
                  },
                },
              },
              { properties: { label: { description: offerText.label } } },
            ],
          },
        },
      },
    });
  });
});
