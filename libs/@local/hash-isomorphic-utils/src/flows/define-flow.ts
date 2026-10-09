import { assertValidFlowDefinition } from "./validate-flow-definition.js";

import type {
  AcceptedKinds,
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

/**
 * The shape of an action definition the builder can type-check against: the `as const` entries of
 * `typedActionDefinitions`.
 */
type ActionDefinitionShape = {
  readonly actionDefinitionId: string;
  readonly inputs: readonly ({
    readonly name: string;
    readonly array: boolean;
    readonly required: boolean;
    readonly default?: unknown;
  } & (
    | { readonly oneOfPayloadKinds: readonly PayloadKind[] }
    /** Its kind is the kind connected to another input (see `KindFrom`). */
    | { readonly kindFrom: string }
  ))[];
  readonly outputs: readonly ({
    readonly name: string;
    readonly array: boolean;
    readonly required: boolean;
  } & (
    | { readonly payloadKind: PayloadKind }
    /** Its kind is the kind connected to an input (see `KindFrom`). */
    | { readonly kindFrom: string }
  ))[];
};

/** An input that lists the kinds it accepts. */
type InputDefinitionShape = {
  readonly name: string;
  readonly oneOfPayloadKinds: readonly PayloadKind[];
  readonly array: boolean;
  readonly required: boolean;
  readonly default?: unknown;
};

type ActionInputShape = ActionDefinitionShape["inputs"][number];

declare const refShape: unique symbol;

/**
 * A typed handle to a value: a flow input, a step output, a `forEach` item or a constant. Connections are made
 * by passing refs, and the type parameters make an incompatible connection a compile error (see `canConnect`
 * for the rule they mirror).
 *
 * @template K the value's payload kind
 * @template A whether the value is an array
 * @template R whether the value is always present when its producer has run
 */
export type Ref<K extends PayloadKind, A extends boolean, R extends boolean> = {
  /** Type-level only: carries the value's shape for assignability checks. */
  readonly [refShape]?: { payloadKind: K; array: A; required: R };
  readonly source: StepInputSource;
  /*
   * Method syntax, so that parameters are compared bivariantly and `Ref` stays covariant in its type
   * parameters. `wrap`'s `this` parameter still stops it being called on an array ref.
   */
  /** Leave the value available to other consumers. */
  read(): Ref<K, A, R>;
  /** Take the value, so no other consumer can. */
  consume(): Ref<K, A, R>;
  /** Wrap a singular value into a one-item array, to feed an array input. */
  wrap(this: Ref<K, false, R>): Ref<K, true, R>;
  /**
   * Allow a value that may be missing to feed a required input, by skipping the consuming step (and
   * everything that depends on it) when the value is missing.
   */
  orSkip(): Ref<K, A, true>;
};

type AnyRef = Ref<PayloadKind, boolean, boolean>;

/**
 * The refs an input accepts. A required input needs a value that is always present, even when it has a
 * default: the default only applies when nothing is connected.
 */
export type InputAccepts<I extends InputDefinitionShape> = Ref<
  I["oneOfPayloadKinds"][number],
  I["array"],
  I["required"] extends true ? true : boolean
>;

type IsMandatory<I extends ActionInputShape> = I["required"] extends true
  ? I extends { readonly default: unknown }
    ? false
    : true
  : false;

type InputAcceptsInAction<
  D extends ActionDefinitionShape,
  I extends ActionInputShape,
> = Ref<
  AcceptedKinds<D["inputs"][number], I>,
  I["array"],
  I["required"] extends true ? true : boolean
>;

export type StepInputs<D extends ActionDefinitionShape> = {
  [I in D["inputs"][number] as IsMandatory<I> extends true
    ? I["name"]
    : never]: InputAcceptsInAction<D, I>;
} & {
  [I in D["inputs"][number] as IsMandatory<I> extends true
    ? never
    : I["name"]]?: InputAcceptsInAction<D, I>;
};

/** The kind of a ref, or `never` if there's no ref. */
type RefKind<R> = R extends Ref<infer K, boolean, boolean> ? K : never;

/**
 * Narrows each input that takes its kind from another (`kindFrom`) to the kind connected to that input.
 */
type DerivedKindInputs<D extends ActionDefinitionShape, In> = {
  [I in D["inputs"][number] as I extends { readonly kindFrom: infer S }
    ? S extends keyof In
      ? I["name"]
      : never
    : never]?: I extends { readonly kindFrom: infer S extends keyof In }
    ? Ref<
        RefKind<In[S]>,
        I["array"],
        I["required"] extends true ? true : boolean
      >
    : never;
};

/** Rejects inputs the action doesn't have. */
type NoUnknownInputs<D extends ActionDefinitionShape, In> = {
  [N in Exclude<keyof In, D["inputs"][number]["name"]>]: never;
};

/**
 * Refs to a step's outputs. An output that takes its kind from an input (`kindFrom`) has the kind connected to it.
 */
export type StepOutputs<D extends ActionDefinitionShape, In = unknown> = {
  [O in D["outputs"][number] as O["name"]]: O extends {
    readonly payloadKind: infer K extends PayloadKind;
  }
    ? Ref<K, O["array"], O["required"]>
    : O extends { readonly kindFrom: infer S }
      ? Ref<
          S extends keyof In ? RefKind<In[S]> : never,
          O["array"],
          O["required"]
        >
      : never;
};

/**
 * Adds an action step, returning refs to its outputs.
 *
 * `In` is the refs given as inputs: an action whose output (or input) takes its kind from an input (`kindFrom`) takes its
 * kind from the ref connected to that input.
 */
export type AddStep = <D extends ActionDefinitionShape, In>(
  id: string,
  action: D,
  options: {
    description: string;
    inputs: In &
      StepInputs<D> &
      DerivedKindInputs<D, In> &
      NoUnknownInputs<D, In>;
    retryCount?: number;
  },
) => { outputs: StepOutputs<D, In> };

type AddForEach = <K extends PayloadKind, CollectedKind extends PayloadKind>(
  id: string,
  over: Ref<K, true, true>,
  options: {
    description: string;
    /** The name of the collected output. */
    collectAs: string;
    /**
     * Adds the steps that run for each item, and returns the output to collect from each run into an array:
     * singular outputs are gathered, and array outputs concatenated. It must always be present.
     */
    steps: (
      item: Ref<K, false, true>,
      scope: ForEachScope,
    ) => Ref<CollectedKind, boolean, true>;
  },
) => Ref<CollectedKind, true, true>;

export type StepScope = { step: AddStep; forEach: AddForEach };

/**
 * What a for-each step's nested steps can add. A for-each step can't contain another one until the Petri net
 * executor (FE-1904) runs flows.
 */
type ForEachScope = Pick<StepScope, "step">;

/**
 * A flow input declared with `flowInput`, before it is named by its key in `defineFlow`.
 */
export type FlowInputDeclaration<
  K extends PayloadKind,
  A extends boolean,
  R extends boolean,
> = {
  readonly definition: Omit<FlowInputDefinition, "name">;
  readonly [refShape]?: { payloadKind: K; array: A; required: R };
};

type FlowInputRefs<
  Inputs extends Record<
    string,
    FlowInputDeclaration<PayloadKind, boolean, boolean>
  >,
> = {
  [N in keyof Inputs]: Inputs[N] extends FlowInputDeclaration<
    infer K,
    infer A,
    infer R
  >
    ? Ref<K, A, R>
    : never;
};

/**
 * Declares a flow input. Inputs are required and singular unless the options say otherwise.
 */
export const flowInput = <
  K extends PayloadKind,
  const Options extends {
    array?: boolean;
    required?: boolean;
    label?: string;
    description?: string;
  } = Record<never, never>,
>(
  payloadKind: K,
  options?: Options,
): FlowInputDeclaration<
  K,
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
const itemScopes = new WeakMap<object, string>();

const createRef = <K extends PayloadKind, A extends boolean, R extends boolean>(
  source: StepInputSource,
  itemOf?: string,
): Ref<K, A, R> => {
  const withOptions = (options: {
    access?: "read" | "consume";
    wrap?: true;
    whenMissing?: "skip";
  }) => {
    if (source.kind === "constant") {
      if (options.wrap) {
        return createRef({
          kind: "constant",
          payload: { ...source.payload, value: [source.payload.value] },
        });
      }

      /* A constant is always present and the same for every consumer, so access and skipping don't apply. */
      return createRef(source);
    }

    return createRef({ ...source, ...options }, itemOf);
  };

  const ref = {
    source,
    read: () => withOptions({ access: "read" }),
    consume: () => withOptions({ access: "consume" }),
    wrap: () => withOptions({ wrap: true }),
    orSkip: () => withOptions({ whenMissing: "skip" }),
  } as Ref<K, A, R>;

  if (itemOf !== undefined) {
    itemScopes.set(ref, itemOf);
  }

  return ref;
};

type Constant = {
  <K extends PayloadKind>(
    payloadKind: K,
    value: readonly PayloadKindValues[K][],
  ): Ref<K, true, true>;
  <K extends PayloadKind>(
    payloadKind: K,
    value: PayloadKindValues[K],
  ): Ref<K, false, true>;
};

/**
 * A fixed value for an input, the same in every run.
 */
export const constant = ((payloadKind: PayloadKind, value: unknown) =>
  createRef({
    kind: "constant",
    payload: { kind: payloadKind, value },
  })) as Constant;

/**
 * Defines a flow with type-checked connections, and returns its validated definition.
 *
 * Steps are added in `build`, and connected by passing refs: flow inputs from `inputs`, and outputs from the
 * steps added before. Anything the types can't check (such as duplicate step ids) is checked by
 * `validateFlowDefinition` when the flow is defined.
 *
 * @throws if the resulting definition has validation errors.
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
  const createScope = (
    steps: StepDefinition<string>[],
    forEachStepId: string | null,
  ): StepScope => {
    const checkItemScope = (
      stepId: string,
      source: StepInputSource,
      ref: object,
    ) => {
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
          Object.entries(inputs as Record<string, AnyRef | undefined>).flatMap(
            ([name, ref]) => {
              if (!ref) {
                return [];
              }

              checkItemScope(stepId, ref.source, ref);

              return [[name, ref.source]];
            },
          ),
        ),
        ...(retryCount === undefined ? {} : { retryCount }),
      });

      return {
        outputs: Object.fromEntries(
          action.outputs.map(({ name }) => [
            name,
            createRef({ kind: "step-output", stepId, outputName: name }),
          ]),
        ) as StepOutputs<typeof action>,
      };
    };

    const forEach: AddForEach = (stepId, over, options) => {
      const nestedSteps: StepDefinition<string>[] = [];

      const collected = options.steps(createRef({ kind: "item" }, stepId), {
        step: createScope(nestedSteps, stepId).step,
      });

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

  const steps: StepDefinition<string>[] = [];

  const inputs = Object.fromEntries(
    Object.keys(metadata.inputs).map((inputName) => [
      inputName,
      createRef({ kind: "flow-input", inputName }),
    ]),
  ) as FlowInputRefs<Inputs>;

  const { outputs } = build({ inputs, ...createScope(steps, null) });

  const flowDefinition = assertValidFlowDefinition({
    name: metadata.name,
    description: metadata.description,
    inputs: Object.entries(metadata.inputs).map(
      ([name, { definition }]): FlowInputDefinition => ({
        name,
        ...definition,
      }),
    ),
    steps,
    outputs: Object.entries(outputs).map(
      ([name, output]): FlowOutputDefinition => {
        const { ref, description } =
          "ref" in output ? output : { ref: output, description: undefined };

        if (ref.source.kind !== "step-output") {
          throw new Error(`Flow output "${name}" must be the output of a step`);
        }

        return {
          name,
          stepId: ref.source.stepId,
          outputName: ref.source.outputName,
          ...(description === undefined ? {} : { description }),
        };
      },
    ),
  });

  return {
    flowDefinitionId: metadata.flowDefinitionId as EntityUuid,
    flowDefinition,
  };
};
