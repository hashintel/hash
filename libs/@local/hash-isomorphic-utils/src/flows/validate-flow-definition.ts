import {
  actionDefinitions as defaultActionDefinitions,
  aiActionDefinitions,
  getKindSources,
} from "./action-definitions.js";
import { type ConnectionSource, canConnect } from "./can-connect.js";
import {
  flowDefinitionSchema,
  payloadKindJsonTypes,
} from "./flow-definition-schema.js";
import {
  type ActionDefinitions,
  createStepShapeResolver,
} from "./step-shapes.js";

import type {
  ActionDefinition,
  ActionStepDefinition,
  FlowActionDefinitionId,
  FlowDefinition,
  ForEachStepDefinition,
  PayloadKind,
  StepDefinition,
  StepInputSource,
} from "./types.js";

export type FlowDefinitionDiagnosticCode =
  | "schema"
  | "duplicateStepId"
  | "duplicateInputName"
  | "duplicateOutputName"
  | "unknownAction"
  | "mixedWorkers"
  | "unknownInput"
  | "missingInput"
  | "unknownFlowInput"
  | "unknownStep"
  | "selfReference"
  | "stepNotInScope"
  | "unknownStepOutput"
  | "itemOutsideForEach"
  | "invalidConstant"
  | "incompatibleConnection"
  | "overNotArray"
  | "overNotRequired"
  | "nestedForEach"
  | "invalidCollect"
  | "cycle"
  | "unusedFlowInput"
  /** An input or output with a derived kind (see `KindFrom`), whose kind source isn't connected. */
  | "unresolvedKind"
  /** An input with a derived kind, given a value of a different kind from its kind source's. */
  | "kindMismatch";

export type FlowDefinitionDiagnostic = {
  severity: "error" | "warning";
  code: FlowDefinitionDiagnosticCode;
  message: string;
  /** Where in the definition the problem is, e.g. `["steps", 2, "inputs", "dataToWrite"]`. */
  path: (string | number)[];
};

export type FlowDefinitionValidationResult =
  | {
      flowDefinition: FlowDefinition<string>;
      diagnostics: FlowDefinitionDiagnostic[];
    }
  /** The input did not match the flow definition schema, so no semantic checks ran. */
  | { flowDefinition: null; diagnostics: FlowDefinitionDiagnostic[] };

type StepEntry = {
  step: StepDefinition<string>;
  path: (string | number)[];
  /** Ids of the for-each steps enclosing this step, outermost first. */
  scope: string[];
};

const isMandatoryInput = (
  input: ActionDefinition<FlowActionDefinitionId>["inputs"][number],
) => input.required && input.default === undefined;

/**
 * Finds one cycle per strongly-connected group of steps, via depth-first search.
 */
const findCycles = (dependencies: Map<string, Set<string>>): string[][] => {
  const cycles: string[][] = [];
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const visit = (stepId: string) => {
    state.set(stepId, "visiting");
    stack.push(stepId);

    for (const dependency of dependencies.get(stepId) ?? []) {
      const dependencyState = state.get(dependency);

      if (dependencyState === "visiting") {
        cycles.push(stack.slice(stack.indexOf(dependency)));
      } else if (dependencyState === undefined) {
        visit(dependency);
      }
    }

    stack.pop();
    state.set(stepId, "done");
  };

  for (const stepId of dependencies.keys()) {
    if (!state.has(stepId)) {
      visit(stepId);
    }
  }

  return cycles;
};

const isOfJsonType = {
  string: (value: unknown) => typeof value === "string",
  number: (value: unknown) => typeof value === "number",
  boolean: (value: unknown) => typeof value === "boolean",
  object: (value: unknown) =>
    typeof value === "object" && value !== null && !Array.isArray(value),
} satisfies Record<(typeof payloadKindJsonTypes)[PayloadKind], unknown>;

/**
 * Checks a flow definition from any source, reporting every problem found rather than stopping at the first,
 * each with a path that a UI can attach to a step or connection. A definition with warnings but no errors can
 * run.
 */
export const validateFlowDefinition = (
  input: unknown,
  options: {
    /** The actions steps can run. Defaults to every action; tests pass their own. */
    actionDefinitions?: ActionDefinitions;
  } = {},
): FlowDefinitionValidationResult => {
  const actionDefinitions: ActionDefinitions =
    options.actionDefinitions ?? defaultActionDefinitions;

  const parsed = flowDefinitionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      flowDefinition: null,
      diagnostics: parsed.error.issues.map((issue) => ({
        severity: "error",
        code: "schema",
        message: issue.message,
        path: issue.path.map((segment) =>
          typeof segment === "symbol" ? segment.toString() : segment,
        ),
      })),
    };
  }

  const flowDefinition = parsed.data;
  const diagnostics: FlowDefinitionDiagnostic[] = [];

  const report = (
    code: FlowDefinitionDiagnosticCode,
    message: string,
    path: (string | number)[],
    severity: FlowDefinitionDiagnostic["severity"] = "error",
  ) => {
    diagnostics.push({ severity, code, message, path });
  };

  const reportDuplicateNames = (
    items: { name: string }[],
    code: "duplicateInputName" | "duplicateOutputName",
    collection: "inputs" | "outputs",
  ) => {
    const seen = new Set<string>();

    for (const [index, { name }] of items.entries()) {
      if (seen.has(name)) {
        report(
          code,
          `The flow has more than one ${
            collection === "inputs" ? "input" : "output"
          } named "${name}"`,
          [collection, index, "name"],
        );
      }

      seen.add(name);
    }
  };

  reportDuplicateNames(flowDefinition.inputs, "duplicateInputName", "inputs");
  reportDuplicateNames(
    flowDefinition.outputs,
    "duplicateOutputName",
    "outputs",
  );

  const stepsById = new Map<string, StepEntry>();

  const collectSteps = (
    steps: StepDefinition<string>[],
    parentPath: (string | number)[],
    scope: string[],
  ) => {
    for (const [index, step] of steps.entries()) {
      const path = [...parentPath, index];

      if (stepsById.has(step.stepId)) {
        report(
          "duplicateStepId",
          `Step id "${step.stepId}" is used more than once`,
          [...path, "stepId"],
        );
      } else {
        stepsById.set(step.stepId, { step, path, scope });
      }

      if (step.kind === "for-each") {
        collectSteps(step.steps, [...path, "steps"], [...scope, step.stepId]);
      }
    }
  };

  collectSteps(flowDefinition.steps, ["steps"], []);

  /** Edges from a step to the steps it depends on, for cycle detection. */
  const dependencies = new Map<string, Set<string>>(
    [...stepsById.keys()].map((stepId) => [stepId, new Set<string>()]),
  );

  const addDependency = (stepId: string, dependsOn: string) => {
    dependencies.get(stepId)?.add(dependsOn);
  };

  const usedFlowInputs = new Set<string>();

  const getActionDefinition = (
    actionDefinitionId: string,
  ): ActionDefinition<FlowActionDefinitionId> | undefined =>
    Object.hasOwn(actionDefinitions, actionDefinitionId)
      ? actionDefinitions[actionDefinitionId]
      : undefined;

  const shapes = createStepShapeResolver(flowDefinition, actionDefinitions);

  const isInScope = (producerScope: string[], consumerScope: string[]) =>
    producerScope.length <= consumerScope.length &&
    producerScope.every(
      (forEachStepId, index) => consumerScope[index] === forEachStepId,
    );

  /** Whether a step has an output of this name, whatever its shape. */
  const hasStepOutput = (step: StepDefinition<string>, outputName: string) =>
    step.kind === "action"
      ? (getActionDefinition(step.actionDefinitionId)?.outputs.some(
          ({ name }) => name === outputName,
        ) ?? false)
      : outputName === step.collect.as;

  const resolveStepOutput = ({
    stepId,
    outputName,
    consumer,
    path,
  }: {
    stepId: string;
    outputName: string;
    consumer: { stepId: string | null; scope: string[] };
    path: (string | number)[];
  }): ConnectionSource | null => {
    const producer = stepsById.get(stepId);

    if (!producer) {
      report("unknownStep", `There is no step "${stepId}"`, path);
      return null;
    }

    if (stepId === consumer.stepId) {
      report(
        "selfReference",
        `Step "${stepId}" cannot consume its own output`,
        path,
      );
      return null;
    }

    if (!isInScope(producer.scope, consumer.scope)) {
      report(
        "stepNotInScope",
        `Step "${stepId}" runs once per item of a for-each step, so its outputs are only available inside that step`,
        path,
      );
      return null;
    }

    if (!hasStepOutput(producer.step, outputName)) {
      report(
        "unknownStepOutput",
        `Step "${stepId}" has no output "${outputName}"`,
        path,
      );
      return null;
    }

    if (consumer.stepId !== null) {
      addDependency(consumer.stepId, stepId);
    }

    /* `null` when the output's kind can't be resolved, which the producing step reports. */
    return shapes.getStepOutputShape(stepId, outputName);
  };

  /**
   * Resolves the shape of a source as seen from a consumer, reporting any problem with the reference itself.
   * Returns `null` when the source can't be resolved, so that no connection check follows.
   */
  const resolveSource = ({
    source,
    consumer,
    path,
  }: {
    source: StepInputSource;
    consumer: { stepId: string | null; scope: string[] };
    path: (string | number)[];
  }): ConnectionSource | null => {
    switch (source.kind) {
      case "flow-input": {
        const flowInput = flowDefinition.inputs.find(
          ({ name }) => name === source.inputName,
        );

        if (!flowInput) {
          report(
            "unknownFlowInput",
            `The flow has no input "${source.inputName}"`,
            path,
          );
          return null;
        }

        usedFlowInputs.add(source.inputName);

        return {
          payloadKind: flowInput.payloadKind,
          array: flowInput.array,
          required: flowInput.required,
        };
      }

      case "step-output":
        return resolveStepOutput({
          stepId: source.stepId,
          outputName: source.outputName,
          consumer,
          path,
        });

      case "item": {
        const forEachStepId = consumer.scope.at(-1);

        if (forEachStepId === undefined) {
          report(
            "itemOutsideForEach",
            "An item can only be used inside a for-each step",
            path,
          );
          return null;
        }

        return shapes.getSourceShape(source, consumer.scope);
      }

      case "constant": {
        const { kind, value } = source.payload;
        const expectedJsonType = payloadKindJsonTypes[kind];

        const values: unknown[] = Array.isArray(value) ? value : [value];

        const isValid = values.every(isOfJsonType[expectedJsonType]);

        if (!isValid) {
          report(
            "invalidConstant",
            `A ${kind} constant must be ${
              expectedJsonType === "object"
                ? "an object"
                : `a ${expectedJsonType}`
            }, or an array of them`,
            [...path, "payload", "value"],
          );
          return null;
        }

        return {
          payloadKind: kind,
          array: Array.isArray(value),
          required: true,
        };
      }
    }
  };

  const wrapOf = (source: StepInputSource) =>
    source.kind !== "constant" && source.wrap === true;

  const skipsWhenMissing = (source: StepInputSource) =>
    source.kind !== "constant" && source.whenMissing === "skip";

  const checkForEachStep = (
    entry: StepEntry,
    step: ForEachStepDefinition<string>,
  ) => {
    if (entry.scope.length > 0) {
      report(
        "nestedForEach",
        "A for-each step can't be inside another for-each step yet",
        entry.path,
      );
    }

    const parallelizeOnShape = resolveSource({
      source: step.over,
      consumer: { stepId: step.stepId, scope: entry.scope },
      path: [...entry.path, "over"],
    });

    if (
      parallelizeOnShape &&
      (!parallelizeOnShape.array || wrapOf(step.over))
    ) {
      report("overNotArray", "A for-each step must iterate over an array", [
        ...entry.path,
        "over",
      ]);
    } else if (
      parallelizeOnShape &&
      !parallelizeOnShape.required &&
      !skipsWhenMissing(step.over)
    ) {
      report(
        "overNotRequired",
        "A for-each step can only iterate over a value that may be missing if it is skipped when the value is missing",
        [...entry.path, "over"],
      );
    }

    for (const child of step.steps) {
      addDependency(step.stepId, child.stepId);
    }

    const collected = stepsById.get(step.collect.stepId);
    const collectPath = [...entry.path, "collect"];

    if (!collected || collected.scope.at(-1) !== step.stepId) {
      report(
        "invalidCollect",
        `A for-each step can only collect the output of a step directly inside it, and "${step.collect.stepId}" is not`,
        [...collectPath, "stepId"],
      );
      return;
    }

    if (!hasStepOutput(collected.step, step.collect.outputName)) {
      report(
        "unknownStepOutput",
        `Step "${step.collect.stepId}" has no output "${step.collect.outputName}"`,
        [...collectPath, "outputName"],
      );
      return;
    }

    const collectedShape = shapes.getStepOutputShape(
      step.collect.stepId,
      step.collect.outputName,
    );

    if (collectedShape && !collectedShape.required) {
      report(
        "invalidCollect",
        "A for-each step can only collect an output that is always present",
        [...collectPath, "outputName"],
      );
    }
  };

  /** The first action checked, which decides which worker the flow's other actions must run on. */
  let firstAction:
    | { actionDefinitionId: string; worker: "ai" | "integration" }
    | undefined;

  const checkActionStep = (
    entry: StepEntry,
    step: ActionStepDefinition<string>,
  ) => {
    const actionDefinition = getActionDefinition(step.actionDefinitionId);

    if (!actionDefinition) {
      report(
        "unknownAction",
        `There is no action "${step.actionDefinitionId}"`,
        [...entry.path, "actionDefinitionId"],
      );
      return;
    }

    const worker = Object.hasOwn(aiActionDefinitions, step.actionDefinitionId)
      ? "ai"
      : "integration";

    if (!firstAction) {
      firstAction = { actionDefinitionId: step.actionDefinitionId, worker };
    } else if (worker !== firstAction.worker) {
      report(
        "mixedWorkers",
        `Action "${step.actionDefinitionId}" runs on the ${worker} worker, but action "${firstAction.actionDefinitionId}" runs on the ${firstAction.worker} worker: a flow's actions must all run on the same worker`,
        [...entry.path, "actionDefinitionId"],
      );
    }

    for (const [inputName, source] of Object.entries(step.inputs)) {
      const path = [...entry.path, "inputs", inputName];

      const target = actionDefinition.inputs.find(
        ({ name }) => name === inputName,
      );

      if (!target) {
        report(
          "unknownInput",
          `Action "${step.actionDefinitionId}" has no input "${inputName}"`,
          path,
        );
        continue;
      }

      const sourceShape = resolveSource({
        source,
        consumer: { stepId: step.stepId, scope: entry.scope },
        path,
      });

      if (!sourceShape) {
        continue;
      }

      let acceptedKinds: readonly PayloadKind[];

      if ("oneOfPayloadKinds" in target) {
        acceptedKinds = target.oneOfPayloadKinds;
      } else {
        /* It takes its kind from another input: with that kind unknown, the problem is reported below. */
        const kind = shapes.getInputKind(step.stepId, target.kindFrom);

        if (!kind) {
          continue;
        }

        if (sourceShape.payloadKind !== kind) {
          report(
            "kindMismatch",
            `Input "${inputName}" takes the kind of input "${target.kindFrom}" (${kind}), but is given ${sourceShape.payloadKind}`,
            path,
          );
          continue;
        }

        acceptedKinds = [kind];
      }

      const check = canConnect({
        source: sourceShape,
        target: {
          oneOfPayloadKinds: acceptedKinds,
          array: target.array,
          required: target.required,
        },
        wrap: wrapOf(source),
        skipWhenMissing: skipsWhenMissing(source),
      });

      if (!check.ok) {
        report("incompatibleConnection", check.message, path);
      }
    }

    /*
     * Inputs and outputs that take their kind from an input the step doesn't connect. An unconnected required input
     * is already reported as missing.
     */
    for (const [sourceName, { input: sourceInput, derived }] of getKindSources(
      actionDefinition,
    )) {
      if (!(sourceName in step.inputs) && !isMandatoryInput(sourceInput)) {
        report(
          "unresolvedKind",
          `The ${derived.map(({ name, of }) => `${of} "${name}"`).join(" and ")} of action "${step.actionDefinitionId}" ${
            derived.length === 1 ? "takes" : "take"
          } the kind of input "${sourceName}", which isn't connected`,
          [...entry.path, "inputs"],
        );
      }
    }

    for (const actionInput of actionDefinition.inputs) {
      if (isMandatoryInput(actionInput) && !(actionInput.name in step.inputs)) {
        report(
          "missingInput",
          `Required input "${actionInput.name}" of action "${step.actionDefinitionId}" is not connected`,
          [...entry.path, "inputs"],
        );
      }
    }
  };

  /*
   * For-each steps first, so that the shape of each item is known before the steps inside them are checked.
   */
  const entries = [...stepsById.values()];

  for (const entry of entries) {
    if (entry.step.kind === "for-each") {
      checkForEachStep(entry, entry.step);
    }
  }

  for (const entry of entries) {
    if (entry.step.kind === "action") {
      checkActionStep(entry, entry.step);
    }
  }

  for (const [index, output] of flowDefinition.outputs.entries()) {
    resolveStepOutput({
      stepId: output.stepId,
      outputName: output.outputName,
      consumer: { stepId: null, scope: [] },
      path: ["outputs", index],
    });
  }

  for (const cycle of findCycles(dependencies)) {
    const firstEntry = stepsById.get(cycle[0]!);

    report(
      "cycle",
      `Steps depend on each other in a cycle: ${[...cycle, cycle[0]].join(
        " → ",
      )}`,
      firstEntry?.path ?? ["steps"],
    );
  }

  for (const [index, { name }] of flowDefinition.inputs.entries()) {
    if (!usedFlowInputs.has(name)) {
      report(
        "unusedFlowInput",
        `Flow input "${name}" is not used by any step`,
        ["inputs", index],
        "warning",
      );
    }
  }

  return { flowDefinition, diagnostics };
};

/**
 * Validates a flow definition, returning it typed as one whose actions all exist.
 *
 * @throws if the definition has validation errors, listing them all.
 */
export const assertValidFlowDefinition = (input: unknown): FlowDefinition => {
  const { flowDefinition, diagnostics } = validateFlowDefinition(input);

  const errors = diagnostics.filter(({ severity }) => severity === "error");

  if (flowDefinition === null || errors.length > 0) {
    const name =
      typeof input === "object" && input !== null && "name" in input
        ? String(input.name)
        : "(unnamed)";

    throw new Error(
      `Flow definition "${name}" is invalid:\n${errors
        .map(({ path, message }) => `- ${path.join(".")}: ${message}`)
        .join("\n")}`,
    );
  }

  /* Every action id was checked against `actionDefinitions` above. */
  return flowDefinition as FlowDefinition;
};
