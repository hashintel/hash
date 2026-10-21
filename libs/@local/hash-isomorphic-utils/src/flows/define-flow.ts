import { assertValidFlowDefinition } from "./validate-flow-definition.js";

import type {
  AddForEach,
  AddStep,
  AnyRef,
  FlowInputDeclaration,
  FlowInputRefs,
  Ref,
  StepOutputs,
  StepScope,
} from "./define-flow-types.js";
import type {
  FlowDefinitionWithId,
  FlowInputDefinition,
  FlowOutputDefinition,
  ForEachStepDefinition,
  PayloadKind,
  PayloadKindValues,
  StepDefinition,
  StepInputSource,
} from "./types.js";
import type { EntityUuid } from "@blockprotocol/type-system";

export type {
  AddStep,
  FlowInputDeclaration,
  InputAccepts,
  Ref,
  StepInputs,
  StepOutputs,
  StepScope,
} from "./define-flow-types.js";

/**
 * Declares a flow input. Inputs are required and singular unless the options say otherwise.
 */
export const flowInput = <
  Kind extends PayloadKind,
  const Options extends {
    array?: boolean;
    required?: boolean;
    label?: string;
    description?: string;
  } = { array?: false; required?: true },
>(
  payloadKind: Kind,
  options?: Options,
): FlowInputDeclaration<
  Kind,
  Options["array"] extends true ? true : false,
  Options["required"] extends false ? false : true
> => ({
  definition: {
    payloadKind,
    array: options?.array ?? false,
    required: options?.required ?? true,
    ...(options?.label === undefined ? {} : { label: options.label }),
    ...(options?.description === undefined
      ? {}
      : { description: options.description }),
  },
});

/**
 * The for-each step each item ref belongs to, so that an item used outside its own step is caught: in a
 * definition, an item always means the item of the nearest enclosing for-each step.
 */
const itemScopes = new WeakMap<AnyRef, string>();

const createRef = <
  Kind extends PayloadKind,
  IsArray extends boolean,
  IsRequired extends boolean,
>(
  source: StepInputSource,
  { itemOf }: { itemOf?: string } = {},
): Ref<Kind, IsArray, IsRequired> => {
  const withOptions = <
    NextIsArray extends boolean = IsArray,
    NextIsRequired extends boolean = IsRequired,
  >(options: {
    access?: "read" | "consume";
    wrap?: true;
    whenMissing?: "skip";
  }): Ref<Kind, NextIsArray, NextIsRequired> => {
    if (source.kind === "constant") {
      if (options.wrap === true) {
        return createRef({
          kind: "constant",
          payload: { ...source.payload, value: [source.payload.value] },
        });
      }

      /* A constant is always present and the same for every consumer, so access and skipping don't apply. */
      return createRef(source);
    }

    return createRef({ ...source, ...options }, { itemOf });
  };

  const ref: Ref<Kind, IsArray, IsRequired> = {
    source,
    read: () => withOptions({ access: "read" }),
    consume: () => withOptions({ access: "consume" }),
    wrap: () => withOptions({ wrap: true }),
    orSkip: () => withOptions({ whenMissing: "skip" }),
  };

  if (itemOf !== undefined) {
    itemScopes.set(ref, itemOf);
  }

  return ref;
};

interface Constant {
  <Kind extends PayloadKind>(
    payloadKind: Kind,
    value: readonly PayloadKindValues[Kind][],
  ): Ref<Kind, true, true>;
  <Kind extends PayloadKind>(
    payloadKind: Kind,
    value: PayloadKindValues[Kind],
  ): Ref<Kind, false, true>;
}

const createConstant = (
  payloadKind: PayloadKind,
  // oxlint-disable-next-line typescript/no-restricted-types -- the overloads in `Constant` pair each kind with its value type
  value: unknown,
): AnyRef =>
  createRef({
    kind: "constant",
    payload: { kind: payloadKind, value },
  });

/**
 * A fixed value for an input, the same in every run.
 */
// SAFETY: the overloads in `Constant` pair each payload kind with its value type; the implementation accepts any
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the overloads in `Constant` narrow the signature of the implementation
export const constant = createConstant as Constant;

const createScope = (
  steps: StepDefinition<string>[],
  forEachStepId: string | null,
): StepScope => {
  const checkItemScope = (
    stepId: string,
    source: StepInputSource,
    ref: AnyRef,
  ): void => {
    if (source.kind === "item" && itemScopes.get(ref) !== forEachStepId) {
      throw new Error(
        `Step "${stepId}" uses the item of a forEach step it is not directly inside`,
      );
    }
  };

  const step: AddStep = (
    stepId,
    action,
    { description, inputs, retryCount },
  ) => {
    steps.push({
      kind: "action",
      stepId,
      actionDefinitionId: action.actionDefinitionId,
      description,
      inputs: Object.fromEntries(
        // SAFETY: every value of `inputs` is a ref (or absent, for an optional input), by `StepInputs`
        Object.entries(inputs as Record<string, AnyRef | undefined>).flatMap(
          ([name, ref]) => {
            if (ref === undefined) {
              return [];
            }

            checkItemScope(stepId, ref.source, ref);

            return [[name, ref.source]];
          },
        ),
      ),
      ...(retryCount === undefined ? {} : { retryCount }),
    });

    const outputs = Object.fromEntries(
      action.outputs.map(({ name }) => [
        name,
        createRef({ kind: "step-output", stepId, outputName: name }),
      ]),
    );

    // SAFETY: the object has a ref for every output of the action, which is what `StepOutputs` describes
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `Object.fromEntries` cannot express the per-output keys of `StepOutputs`
    return { outputs: outputs as StepOutputs<typeof action> };
  };

  const forEach: AddForEach = (stepId, over, options) => {
    const nestedSteps: StepDefinition<string>[] = [];

    const collected = options.steps(
      createRef({ kind: "item" }, { itemOf: stepId }),
      {
        step: createScope(nestedSteps, stepId).step,
      },
    );

    if (collected.source.kind !== "step-output") {
      throw new Error(
        `forEach step "${stepId}" must collect the output of one of its steps`,
      );
    }

    const forEachStep: ForEachStepDefinition<string> = {
      kind: "for-each",
      stepId,
      description: options.description,
      over: over.source,
      steps: nestedSteps,
      collect: {
        stepId: collected.source.stepId,
        outputName: collected.source.outputName,
        as: options.collectAs,
      },
    };

    steps.push(forEachStep);

    return createRef({
      kind: "step-output",
      stepId,
      outputName: options.collectAs,
    });
  };

  return { step, forEach };
};

const toInputDefinition = (
  name: string,
  { definition }: FlowInputDeclaration<PayloadKind, boolean, boolean>,
): FlowInputDefinition => ({ name, ...definition });

const toOutputDefinition = (
  name: string,
  output: AnyRef | { ref: AnyRef; description: string },
): FlowOutputDefinition => {
  const { ref, description } =
    "ref" in output ? output : { ref: output, description: undefined };

  if (ref.source.kind !== "step-output") {
    throw new Error(`Flow output "${name}" must be the output of a step`);
  }

  const definition: FlowOutputDefinition = {
    name,
    stepId: ref.source.stepId,
    outputName: ref.source.outputName,
  };

  if (description !== undefined) {
    definition.description = description;
  }

  return definition;
};

/**
 * Defines a flow with type-checked connections, and returns its validated definition.
 *
 * Steps are added in `build`, and connected by passing refs: flow inputs from `inputs`, and outputs from the
 * steps added before. Anything the types can't check (such as duplicate step ids) is checked by
 * `validateFlowDefinition` when the flow is defined.
 *
 * @throws {Error} if the resulting definition has validation errors.
 */
export const defineFlow = <
  const Inputs extends Record<
    string,
    FlowInputDeclaration<PayloadKind, boolean, boolean>
  >,
>(
  metadata: {
    flowDefinitionId: string;
    name: string;
    description: string;
    inputs: Inputs;
  },
  build: (context: { inputs: FlowInputRefs<Inputs> } & StepScope) => {
    /** Step outputs to expose as the flow's outputs, optionally with a description. */
    outputs: Record<string, AnyRef | { ref: AnyRef; description: string }>;
  },
): FlowDefinitionWithId => {
  const steps: StepDefinition<string>[] = [];

  const inputRefs = Object.fromEntries(
    Object.keys(metadata.inputs).map((inputName) => [
      inputName,
      createRef({ kind: "flow-input", inputName }),
    ]),
  );
  // SAFETY: there is a ref for every input key, which is what `FlowInputRefs` describes
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `Object.fromEntries` cannot express the per-input keys of `FlowInputRefs`
  const inputs = inputRefs as FlowInputRefs<Inputs>;

  const { outputs } = build({ inputs, ...createScope(steps, null) });

  const flowDefinition = assertValidFlowDefinition({
    name: metadata.name,
    description: metadata.description,
    inputs: Object.entries(metadata.inputs).map(([name, declaration]) =>
      toInputDefinition(name, declaration),
    ),
    steps,
    outputs: Object.entries(outputs).map(([name, output]) =>
      toOutputDefinition(name, output),
    ),
  });

  return {
    // SAFETY: flow definition ids are written as UUID literals in the flow definitions
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the id is authored as a plain string and branded here
    flowDefinitionId: metadata.flowDefinitionId as EntityUuid,
    flowDefinition,
  };
};
