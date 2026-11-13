import { describe, expect, it } from "vitest";

import { getItemName } from "./item-name";
import { emptyQueryForm, toEntityQuery } from "./query-form";
import { actionStep, flowWith } from "./step-fixtures";

import type { BaseUrl } from "@blockprotocol/type-system";
import type {
  FlowDefinition,
  ForEachStepDefinition,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";

const supplierType =
  "https://example.com/@acme/types/entity-type/supplier/" as BaseUrl;
const certificateType =
  "https://example.com/@acme/types/entity-type/certificate/" as BaseUrl;

const entityTypeTitles = new Map([
  [supplierType, "Supplier"],
  [certificateType, "Certificate"],
]);

const forEachOver = (over: StepInputSource): ForEachStepDefinition<string> => ({
  kind: "for-each",
  stepId: "each",
  description: "",
  over,
  steps: [actionStep("inner")],
  collect: { stepId: "inner", outputName: "entities", as: "collected" },
});

/** A For each over the entities a Find entities step finds with `query`. */
const overFound = (query: unknown) =>
  flowWith([
    actionStep("find", {
      inputs: {
        query: {
          kind: "constant",
          payload: { kind: "EntityQuery", value: query },
        },
      },
    }),
    forEachOver({
      kind: "step-output",
      stepId: "find",
      outputName: "entities",
    }),
  ]);

const itemNameIn = (flowDefinition: FlowDefinition<string>) =>
  getItemName({ flowDefinition, forEachStepId: "each", entityTypeTitles });

describe("getItemName", () => {
  it("names the item after the one type a Find entities query is limited to", () => {
    const query = toEntityQuery({
      ...emptyQueryForm,
      entityTypeBaseUrls: [supplierType],
    });

    expect(itemNameIn(overFound(query))).toBe("supplier");
  });

  it("follows the list through steps that pass on some of its items", () => {
    const query = toEntityQuery({
      ...emptyQueryForm,
      entityTypeBaseUrls: [supplierType],
    });
    const [find] = overFound(query).steps;

    const flowDefinition = flowWith([
      find!,
      actionStep("sorted", {
        actionDefinitionId: "orderBy",
        inputs: {
          items: {
            kind: "step-output",
            stepId: "find",
            outputName: "entities",
          },
        },
      }),
      actionStep("firstFive", {
        actionDefinitionId: "takeFirst",
        inputs: {
          items: { kind: "step-output", stepId: "sorted", outputName: "items" },
        },
      }),
      forEachOver({
        kind: "step-output",
        stepId: "firstFive",
        outputName: "items",
      }),
    ]);

    expect(itemNameIn(flowDefinition)).toBe("supplier");
  });

  it("still reads the type when the query's conditions can't be read back", () => {
    const query = {
      filter: {
        all: [
          {
            any: [
              {
                equal: [
                  { path: ["type", "baseUrl"] },
                  { parameter: certificateType },
                ],
              },
            ],
          },
          { exists: { path: ["label"] } },
        ],
      },
    };

    expect(itemNameIn(overFound(query))).toBe("certificate");
  });

  it("calls any other list of entities an entity", () => {
    const anyType = toEntityQuery(emptyQueryForm);
    const twoTypes = toEntityQuery({
      ...emptyQueryForm,
      entityTypeBaseUrls: [supplierType, certificateType],
    });
    const unknownType = toEntityQuery({
      ...emptyQueryForm,
      entityTypeBaseUrls: [
        "https://example.com/@acme/types/entity-type/unknown/" as BaseUrl,
      ],
    });

    expect(itemNameIn(overFound(anyType))).toBe("entity");
    expect(itemNameIn(overFound(twoTypes))).toBe("entity");
    expect(itemNameIn(overFound(unknownType))).toBe("entity");
  });

  it("calls an item of a list that isn't of entities an item", () => {
    const flowDefinition: FlowDefinition<string> = {
      ...flowWith([forEachOver({ kind: "flow-input", inputName: "urls" })]),
      inputs: [
        { name: "urls", payloadKind: "Text", array: true, required: true },
      ],
    };

    expect(itemNameIn(flowDefinition)).toBe("item");
  });
});
