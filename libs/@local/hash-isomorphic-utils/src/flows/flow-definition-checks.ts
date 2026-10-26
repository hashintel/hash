import { aiActionDefinitions, getKindSources } from "./action-definitions.js";
import { canConnect } from "./can-connect.js";
import { getPayloadKindJsonType } from "./types.js";

import type { ConnectionSource } from "./can-connect.js";
import type { ActionDefinitions, StepShapeResolver } from "./step-shapes.js";
import type {
  ActionDefinition,
  ActionStepDefinition,
  FlowActionDefinitionId,
  FlowDefinition,
  ForEachStepDefinition,
  InputDefinition,
  PayloadJsonType,
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
  | "kindMismatch"
  /** An input its action's own check rejects (see `ActionStepCheck`). */
  | "invalidInput";

export interface FlowDefinitionDiagnostic {
  severity: "error" | "warning";
  code: FlowDefinitionDiagnosticCode;
  message: string;
  /** Where in the definition the problem is, e.g. `["steps", 2, "inputs", "dataToWrite"]`. */
  path: (string | number)[];
}

export interface StepEntry {
  step: StepDefinition<string>;
  path: (string | number)[];
  /** Ids of the for-each steps enclosing this step, outermost first. */
  scope: string[];
}

/** The state shared by the checks of one validation run. */
export interface ValidationContext {
  flowDefinition: FlowDefinition<string>;
  actionDefinitions: ActionDefinitions;
  shapes: StepShapeResolver;
  stepsById: Map<string, StepEntry>;
  /** Edges from a step to the steps it depends on, for cycle detection. */
  dependencies: Map<string, Set<string>>;
  usedFlowInputs: Set<string>;
  /** The first action checked, which decides which worker the flow's other actions must run on. */
  firstAction:
    | { actionDefinitionId: string; worker: "ai" | "integration" }
    | undefined;
  report: (
    diagnostic: Omit<FlowDefinitionDiagnostic, "severity"> & {
      severity?: FlowDefinitionDiagnostic["severity"];
    },
  ) => void;
}

type Path = (string | number)[];

interface Consumer {
  stepId: string | null;
  scope: string[];
}

const isMandatoryInput = (
  input: ActionDefinition<FlowActionDefinitionId>["inputs"][number],
): boolean => input.required && input.default === undefined;

/**
 * Finds one cycle per strongly-connected group of steps, via depth-first search.
 */
export const findCycles = (
  dependencies: Map<string, Set<string>>,
): string[][] => {
  const cycles: string[][] = [];
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const visit = (stepId: string): void => {
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

// oxlint-disable-next-line typescript/no-restricted-types -- constants are arbitrary JSON values until checked against their kind
const isOfJsonType = (jsonType: PayloadJsonType, value: unknown): boolean => {
  switch (jsonType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
  }
};

const getActionDefinition = (
  context: ValidationContext,
  actionDefinitionId: string,
): ActionDefinition<FlowActionDefinitionId> | undefined =>
  Object.hasOwn(context.actionDefinitions, actionDefinitionId)
    ? context.actionDefinitions[actionDefinitionId]
    : undefined;

const addDependency = (
  context: ValidationContext,
  stepId: string,
  dependsOn: string,
): void => {
  context.dependencies.get(stepId)?.add(dependsOn);
};

const isInScope = (producerScope: string[], consumerScope: string[]): boolean =>
  producerScope.length <= consumerScope.length &&
  producerScope.every(
    (forEachStepId, index) => consumerScope[index] === forEachStepId,
  );

const wrapOf = (source: StepInputSource): boolean =>
  source.kind !== "constant" && source.wrap === true;

const skipsWhenMissing = (source: StepInputSource): boolean =>
  source.kind !== "constant" && source.whenMissing === "skip";

/** Whether a step has an output of this name, whatever its shape. */
const hasStepOutput = (
  context: ValidationContext,
  step: StepDefinition<string>,
  outputName: string,
): boolean => {
  if (step.kind !== "action") {
    return outputName === step.collect.as;
  }

  const actionDefinition = getActionDefinition(
    context,
    step.actionDefinitionId,
  );

  return (
    actionDefinition?.outputs.some(({ name }) => name === outputName) ?? false
  );
};

/**
 * The step a for-each step collects from, if it's directly inside the for-each step.
 */
const getCollectedStep = (
  context: ValidationContext,
  step: ForEachStepDefinition<string>,
): StepEntry | undefined => {
  const collected = context.stepsById.get(step.collect.stepId);

  return collected?.scope.at(-1) === step.stepId ? collected : undefined;
};

const reportDuplicateNames = (
  context: ValidationContext,
  {
    items,
    code,
    collection,
  }: {
    items: { name: string }[];
    code: "duplicateInputName" | "duplicateOutputName";
    collection: "inputs" | "outputs";
  },
): void => {
  const seen = new Set<string>();
  const noun = collection === "inputs" ? "input" : "output";

  for (const [index, { name }] of items.entries()) {
    if (seen.has(name)) {
      context.report({
        code,
        message: `The flow has more than one ${noun} named "${name}"`,
        path: [collection, index, "name"],
      });
    }

    seen.add(name);
  }
};

export const checkDuplicateNames = (context: ValidationContext): void => {
  reportDuplicateNames(context, {
    items: context.flowDefinition.inputs,
    code: "duplicateInputName",
    collection: "inputs",
  });
  reportDuplicateNames(context, {
    items: context.flowDefinition.outputs,
    code: "duplicateOutputName",
    collection: "outputs",
  });
};

export const collectSteps = (
  context: ValidationContext,
  {
    steps,
    parentPath,
    scope,
  }: { steps: StepDefinition<string>[]; parentPath: Path; scope: string[] },
): void => {
  for (const [index, step] of steps.entries()) {
    const path = [...parentPath, index];

    if (context.stepsById.has(step.stepId)) {
      context.report({
        code: "duplicateStepId",
        message: `Step id "${step.stepId}" is used more than once`,
        path: [...path, "stepId"],
      });
    } else {
      context.stepsById.set(step.stepId, { step, path, scope });
    }

    if (step.kind === "for-each") {
      collectSteps(context, {
        steps: step.steps,
        parentPath: [...path, "steps"],
        scope: [...scope, step.stepId],
      });
    }
  }
};

export const resolveStepOutput = (
  context: ValidationContext,
  {
    stepId,
    outputName,
    consumer,
    path,
  }: {
    stepId: string;
    outputName: string;
    consumer: Consumer;
    path: Path;
  },
): ConnectionSource | null => {
  const producer = context.stepsById.get(stepId);

  if (producer === undefined) {
    context.report({
      code: "unknownStep",
      message: `There is no step "${stepId}"`,
      path,
    });
    return null;
  }

  if (stepId === consumer.stepId) {
    context.report({
      code: "selfReference",
      message: `Step "${stepId}" cannot consume its own output`,
      path,
    });
    return null;
  }

  if (!isInScope(producer.scope, consumer.scope)) {
    context.report({
      code: "stepNotInScope",
      message: `Step "${stepId}" runs once per item of a for-each step, so its outputs are only available inside that step`,
      path,
    });
    return null;
  }

  if (!hasStepOutput(context, producer.step, outputName)) {
    context.report({
      code: "unknownStepOutput",
      message: `Step "${stepId}" has no output "${outputName}"`,
      path,
    });
    return null;
  }

  if (consumer.stepId !== null) {
    addDependency(context, consumer.stepId, stepId);
  }

  /* `null` when the output's kind can't be resolved, which the producing step reports. */
  return context.shapes.getStepOutputShape(stepId, outputName);
};

const resolveConstant = (
  context: ValidationContext,
  {
    payload,
    path,
  }: {
    payload: Extract<StepInputSource, { kind: "constant" }>["payload"];
    path: Path;
  },
): ConnectionSource | null => {
  const { kind, value } = payload;
  const expectedJsonType = getPayloadKindJsonType(kind);

  const isValid = Array.isArray(value)
    ? value.every((item) => isOfJsonType(expectedJsonType, item))
    : isOfJsonType(expectedJsonType, value);

  if (!isValid) {
    const article = expectedJsonType === "object" ? "an" : "a";

    context.report({
      code: "invalidConstant",
      message: `A ${kind} constant must be ${article} ${expectedJsonType}, or an array of them`,
      path: [...path, "payload", "value"],
    });
    return null;
  }

  return {
    payloadKind: kind,
    array: Array.isArray(value),
    required: true,
  };
};

/**
 * Resolves the shape of a source as seen from a consumer, reporting any problem with the reference itself.
 * Returns `null` when the source can't be resolved, so that no connection check follows.
 */
const resolveSource = (
  context: ValidationContext,
  {
    source,
    consumer,
    path,
  }: {
    source: StepInputSource;
    consumer: Consumer;
    path: Path;
  },
): ConnectionSource | null => {
  switch (source.kind) {
    case "flow-input": {
      const flowInput = context.flowDefinition.inputs.find(
        ({ name }) => name === source.inputName,
      );

      if (flowInput === undefined) {
        context.report({
          code: "unknownFlowInput",
          message: `The flow has no input "${source.inputName}"`,
          path,
        });
        return null;
      }

      context.usedFlowInputs.add(source.inputName);

      return {
        payloadKind: flowInput.payloadKind,
        array: flowInput.array,
        required: flowInput.required,
      };
    }

    case "step-output": {
      return resolveStepOutput(context, {
        stepId: source.stepId,
        outputName: source.outputName,
        consumer,
        path,
      });
    }

    case "item": {
      if (consumer.scope.at(-1) === undefined) {
        context.report({
          code: "itemOutsideForEach",
          message: "An item can only be used inside a for-each step",
          path,
        });
        return null;
      }

      return context.shapes.getSourceShape(source, consumer.scope);
    }

    case "constant": {
      return resolveConstant(context, { payload: source.payload, path });
    }
  }
};

const checkForEachOver = (
  context: ValidationContext,
  entry: StepEntry,
  step: ForEachStepDefinition<string>,
): void => {
  const overPath = [...entry.path, "over"];

  const parallelizeOn = resolveSource(context, {
    source: step.over,
    consumer: { stepId: step.stepId, scope: entry.scope },
    path: overPath,
  });

  if (parallelizeOn === null) {
    return;
  }

  if (!parallelizeOn.array || wrapOf(step.over)) {
    context.report({
      code: "overNotArray",
      message: "A for-each step must iterate over an array",
      path: overPath,
    });
  } else if (!parallelizeOn.required && !skipsWhenMissing(step.over)) {
    context.report({
      code: "overNotRequired",
      message:
        "A for-each step can only iterate over a value that may be missing if it is skipped when the value is missing",
      path: overPath,
    });
  }
};

export const checkForEachStep = (
  context: ValidationContext,
  entry: StepEntry,
  step: ForEachStepDefinition<string>,
): void => {
  if (entry.scope.length > 0) {
    context.report({
      code: "nestedForEach",
      message: "A for-each step can't be inside another for-each step yet",
      path: entry.path,
    });
  }

  checkForEachOver(context, entry, step);

  for (const child of step.steps) {
    addDependency(context, step.stepId, child.stepId);
  }

  const collected = getCollectedStep(context, step);
  const collectPath = [...entry.path, "collect"];

  if (collected === undefined) {
    context.report({
      code: "invalidCollect",
      message: `A for-each step can only collect the output of a step directly inside it, and "${step.collect.stepId}" is not`,
      path: [...collectPath, "stepId"],
    });
    return;
  }

  if (!hasStepOutput(context, collected.step, step.collect.outputName)) {
    context.report({
      code: "unknownStepOutput",
      message: `Step "${step.collect.stepId}" has no output "${step.collect.outputName}"`,
      path: [...collectPath, "outputName"],
    });
    return;
  }

  const collectedOutput = context.shapes.getStepOutputShape(
    step.collect.stepId,
    step.collect.outputName,
  );

  if (collectedOutput !== null && !collectedOutput.required) {
    context.report({
      code: "invalidCollect",
      message:
        "A for-each step can only collect an output that is always present",
      path: [...collectPath, "outputName"],
    });
  }
};

/** Reports a flow mixing actions that run on different workers. */
const checkWorker = (
  context: ValidationContext,
  entry: StepEntry,
  step: ActionStepDefinition<string>,
): void => {
  const worker = Object.hasOwn(aiActionDefinitions, step.actionDefinitionId)
    ? "ai"
    : "integration";

  const { firstAction } = context;

  if (firstAction === undefined) {
    context.firstAction = {
      actionDefinitionId: step.actionDefinitionId,
      worker,
    };
  } else if (worker !== firstAction.worker) {
    context.report({
      code: "mixedWorkers",
      message: `Action "${step.actionDefinitionId}" runs on the ${worker} worker, but action "${firstAction.actionDefinitionId}" runs on the ${firstAction.worker} worker: a flow's actions must all run on the same worker`,
      path: [...entry.path, "actionDefinitionId"],
    });
  }
};

/**
 * The kinds an input accepts, or `null` when they are unknown or the connected value has the wrong kind (reported
 * here).
 */
const resolveAcceptedKinds = (
  context: ValidationContext,
  {
    step,
    target,
    inputName,
    connectionSource,
    path,
  }: {
    step: ActionStepDefinition<string>;
    target: InputDefinition;
    inputName: string;
    connectionSource: ConnectionSource;
    path: Path;
  },
): readonly PayloadKind[] | null => {
  if ("oneOfPayloadKinds" in target) {
    return target.oneOfPayloadKinds;
  }

  /* It takes its kind from another input: with that kind unknown, the problem is reported elsewhere. */
  const kind = context.shapes.getInputKind(step.stepId, target.kindFrom);

  if (kind === null) {
    return null;
  }

  if (connectionSource.payloadKind !== kind) {
    context.report({
      code: "kindMismatch",
      message: `Input "${inputName}" takes the kind of input "${target.kindFrom}" (${kind}), but is given ${connectionSource.payloadKind}`,
      path,
    });
    return null;
  }

  return [kind];
};

const checkActionInput = (
  context: ValidationContext,
  {
    entry,
    step,
    actionDefinition,
    inputName,
    source,
  }: {
    entry: StepEntry;
    step: ActionStepDefinition<string>;
    actionDefinition: ActionDefinition<FlowActionDefinitionId>;
    inputName: string;
    source: StepInputSource;
  },
): void => {
  const path = [...entry.path, "inputs", inputName];

  const target = actionDefinition.inputs.find(({ name }) => name === inputName);

  if (target === undefined) {
    context.report({
      code: "unknownInput",
      message: `Action "${step.actionDefinitionId}" has no input "${inputName}"`,
      path,
    });
    return;
  }

  const connectionSource = resolveSource(context, {
    source,
    consumer: { stepId: step.stepId, scope: entry.scope },
    path,
  });

  if (connectionSource === null) {
    return;
  }

  const acceptedKinds = resolveAcceptedKinds(context, {
    step,
    target,
    inputName,
    connectionSource,
    path,
  });

  if (acceptedKinds === null) {
    return;
  }

  const check = canConnect({
    source: connectionSource,
    target: {
      oneOfPayloadKinds: acceptedKinds,
      array: target.array,
      required: target.required,
    },
    wrap: wrapOf(source),
    skipWhenMissing: skipsWhenMissing(source),
  });

  if (!check.ok) {
    context.report({
      code: "incompatibleConnection",
      message: check.message,
      path,
    });
  }
};

/**
 * Inputs and outputs that take their kind from an input the step doesn't connect, and required inputs that aren't
 * connected. An unconnected required input is reported as missing rather than as an unresolved kind.
 */
const checkUnconnectedInputs = (
  context: ValidationContext,
  entry: StepEntry,
  step: ActionStepDefinition<string>,
  actionDefinition: ActionDefinition<FlowActionDefinitionId>,
): void => {
  for (const [sourceName, { input: sourceInput, derived }] of getKindSources(
    actionDefinition,
  )) {
    if (!(sourceName in step.inputs) && !isMandatoryInput(sourceInput)) {
      const derivedNames = derived
        .map(({ name, of }) => `${of} "${name}"`)
        .join(" and ");
      const verb = derived.length === 1 ? "takes" : "take";

      context.report({
        code: "unresolvedKind",
        message: `The ${derivedNames} of action "${step.actionDefinitionId}" ${verb} the kind of input "${sourceName}", which isn't connected`,
        path: [...entry.path, "inputs"],
      });
    }
  }

  for (const actionInput of actionDefinition.inputs) {
    if (isMandatoryInput(actionInput) && !(actionInput.name in step.inputs)) {
      context.report({
        code: "missingInput",
        message: `Required input "${actionInput.name}" of action "${step.actionDefinitionId}" is not connected`,
        path: [...entry.path, "inputs"],
      });
    }
  }
};

export const checkActionStep = (
  context: ValidationContext,
  entry: StepEntry,
  step: ActionStepDefinition<string>,
): void => {
  const actionDefinition = getActionDefinition(
    context,
    step.actionDefinitionId,
  );

  if (actionDefinition === undefined) {
    context.report({
      code: "unknownAction",
      message: `There is no action "${step.actionDefinitionId}"`,
      path: [...entry.path, "actionDefinitionId"],
    });
    return;
  }

  checkWorker(context, entry, step);

  for (const [inputName, source] of Object.entries(step.inputs)) {
    checkActionInput(context, {
      entry,
      step,
      actionDefinition,
      inputName,
      source,
    });
  }

  checkUnconnectedInputs(context, entry, step, actionDefinition);

  actionDefinition.check?.({
    step,
    getInputKind: (inputName) =>
      context.shapes.getInputKind(step.stepId, inputName),
    report: (inputName, message) => {
      context.report({
        code: "invalidInput",
        message,
        path: [...entry.path, "inputs", inputName],
      });
    },
  });
};
