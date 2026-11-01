import { describe, expect, it } from "vitest";

import { validateFlowDefinitionEntity } from "./mappings.js";

import type { FlowDefinition as FlowDefinitionEntity } from "../system-types/flowdefinition.js";
import type { FlowDefinition } from "./types.js";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

const entityHolding = ({
  name,
  description,
  inputs,
  steps,
  outputs,
}: FlowDefinition<string>) =>
  ({
    properties: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
        name,
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        description,
      "https://hash.ai/@h/types/property-type/input-definition/": inputs,
      "https://hash.ai/@h/types/property-type/step-definition/": steps,
      "https://hash.ai/@h/types/property-type/output-definition/": outputs,
    },
  }) as unknown as HashEntity<FlowDefinitionEntity>;

const answerStep = {
  kind: "action",
  stepId: "answer",
  actionDefinitionId: "answerQuestion",
  description: "",
  inputs: { question: { kind: "flow-input", inputName: "question" } },
} as const;

const question = {
  name: "question",
  payloadKind: "Text",
  array: false,
  required: true,
} as const;

describe("validateFlowDefinitionEntity", () => {
  it("reads a definition that isn't valid, with its problems but without the definition", () => {
    const result = validateFlowDefinitionEntity(
      entityHolding({
        name: "Half-built",
        description: "Not finished yet",
        inputs: [],
        steps: [answerStep],
        outputs: [],
      }),
    );

    expect(result).toMatchObject({
      name: "Half-built",
      description: "Not finished yet",
      flowDefinition: null,
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "unknownFlowInput",
        path: ["steps", 0, "inputs", "question"],
      }),
    );
  });

  it("gives the definition of a flow with only warnings, which can run", () => {
    const flowDefinition = {
      name: "Unused input",
      description: "",
      inputs: [question, { ...question, name: "unused" }],
      steps: [answerStep],
      outputs: [],
    };

    const result = validateFlowDefinitionEntity(entityHolding(flowDefinition));

    expect(result.diagnostics).toMatchObject([
      { severity: "warning", code: "unusedFlowInput" },
    ]);
    expect(result.flowDefinition).toEqual(flowDefinition);
  });
});
