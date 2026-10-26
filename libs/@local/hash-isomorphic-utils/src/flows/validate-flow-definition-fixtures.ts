import { validateFlowDefinition } from "./validate-flow-definition.js";

import type { FlowDefinition } from "./types.js";
import type { FlowDefinitionDiagnostic } from "./validate-flow-definition.js";

// oxlint-disable-next-line typescript/no-restricted-types -- the fixtures are deliberately loose JSON, because the validator accepts any parsed input
export type Fixture = unknown;

export type FixtureObject = Record<string, Fixture>;

export interface FlowDefinitionFixture {
  name: string;
  description: string;
  inputs: Fixture[];
  steps: Fixture[];
  outputs: Fixture[];
}

export const baseDefinition = {
  name: "Test",
  description: "A flow for testing validation",
  inputs: [
    { name: "question", payloadKind: "Text", array: false, required: true },
  ],
  steps: [],
  outputs: [],
} satisfies FlowDefinition;

export const diagnosticsOf = (
  flowDefinition: Fixture,
): Omit<FlowDefinitionDiagnostic, "message">[] =>
  validateFlowDefinition(flowDefinition).diagnostics.map(
    ({ severity, code, path }): Omit<FlowDefinitionDiagnostic, "message"> => ({
      severity,
      code,
      path,
    }),
  );

export const errorDiagnosticsOf = (
  flowDefinition: Fixture,
): FlowDefinitionDiagnostic[] =>
  validateFlowDefinition(flowDefinition).diagnostics.filter(
    ({ severity }) => severity === "error",
  );

const defaultAnswerInputs = {
  question: { kind: "flow-input", inputName: "question" },
};

export const answerStep = (
  stepId: string,
  inputs: FixtureObject = defaultAnswerInputs,
): FixtureObject => ({
  kind: "action",
  stepId,
  actionDefinitionId: "answerQuestion",
  description: "",
  inputs,
});
