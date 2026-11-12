import { describe, expect, expectTypeOf, test } from "vitest";

import {
  brunchTools,
  type OfferedQuestions,
  zOfferAnswersInput,
} from "../index";
import { offerBounds, offerText, questionKinds } from "./question-kinds";

import type { z } from "zod";

const quarantine = {
  kind: "choose",
  label: "Quarantined shipment",
  text: "Quarantined shipment?",
  options: [
    { label: "Stays counted as open" },
    { label: "Drops out until released" },
  ],
} as const;
const demand = {
  kind: "confirm",
  label: "Production demand",
  text: "Production demand?",
} as const;
/** Case 9 of the P0 set: the opening battery, with answers offered only for appetite. */
const opening = {
  questions: [
    { kind: "open", label: "Summer peak case", text: "Summer peak case?" },
    { kind: "open", label: "Model boundary", text: "Model boundary?" },
    {
      kind: "open",
      label: "What else judges it",
      text: "What else judges it?",
    },
    {
      kind: "choose",
      label: "Time to spend",
      text: "Time to spend?",
      options: [
        { label: "Quick" },
        { label: "Standard" },
        { label: "Thorough" },
        { label: "Deep" },
      ],
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
    [
      "options that carry the answer in full",
      {
        questions: [
          {
            ...quarantine,
            options: [
              { label: "Stays open", value: "It stays counted as open" },
              { label: "Drops out" },
            ],
          },
        ],
      },
    ],
    ["the opening battery", opening],
  ])("accepts %s", (_name, input) => {
    expect(zOfferAnswersInput.parse(input)).toEqual(input);
  });

  test.each([
    [
      "a choose with one option",
      {
        questions: [
          { ...quarantine, options: [{ label: "Stays counted as open" }] },
        ],
      },
    ],
    [
      "five questions",
      {
        questions: Array.from({ length: 5 }, (_each, index) => ({
          ...demand,
          label: `Production demand ${index + 1}`,
        })),
      },
    ],
    [
      "two questions under one label, whatever its case",
      { questions: [demand, { ...quarantine, label: "production demand " }] },
    ],
    [
      "two options under one label",
      {
        questions: [
          {
            ...quarantine,
            options: [{ label: "Drops out" }, { label: "drops out" }],
          },
        ],
      },
    ],
    ["an unknown key", { questions: [{ ...demand, mark: "clicked" }] }],
    ["an empty label", { questions: [{ ...demand, label: "  " }] }],
    [
      "an empty option",
      {
        questions: [
          {
            ...quarantine,
            options: [{ label: "Stays counted as open" }, { label: "" }],
          },
        ],
      },
    ],
    [
      "an option whose label is a sentence",
      {
        questions: [
          {
            ...quarantine,
            options: [
              { label: "It stays counted as an open purchase order" },
              { label: "Drops out" },
            ],
          },
        ],
      },
    ],
    ["no questions", { questions: [] }],
  ])("rejects %s", (_name, input) => {
    expect(zOfferAnswersInput.safeParse(input).success).toBe(false);
  });

  test("accepts a turn whose questions are all open, since the offer is where they are asked", () => {
    const input = {
      questions: [
        {
          kind: "open",
          label: "Recent order",
          text: "Can you walk me through one recent order?",
        },
      ],
    };
    expect(zOfferAnswersInput.parse(input)).toEqual(input);
  });

  test("rejects a question without its wording", () => {
    expect(
      zOfferAnswersInput.safeParse({
        questions: [{ kind: "confirm", label: "Production demand" }],
      }).success,
    ).toBe(false);
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
    expectTypeOf<
      z.output<typeof zOfferAnswersInput>
    >().toEqualTypeOf<OfferedQuestions>();
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
                    items: {
                      required: ["label"],
                      properties: {
                        label: {
                          description: offerText.optionLabel,
                          maxLength: questionKinds.choose.bounds.maxLabelLength,
                        },
                        value: { description: offerText.optionValue },
                      },
                    },
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
