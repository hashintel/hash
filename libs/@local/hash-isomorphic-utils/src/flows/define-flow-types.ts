import type {
  AcceptedKinds,
  FlowInputDefinition,
  PayloadKind,
  StepInputSource,
} from "./types.js";

/**
 * The shape of an action definition the builder can type-check against: the `as const` entries of
 * `typedActionDefinitions`.
 */
export interface ActionDefinition {
  readonly actionDefinitionId: string;
  readonly inputs: readonly ({
    readonly name: string;
    readonly array: boolean;
    readonly required: boolean;
    // oxlint-disable-next-line typescript/no-restricted-types -- a default is any value of the input's payload kind
    readonly default?: unknown;
  } & (
    | { readonly oneOfPayloadKinds: readonly PayloadKind[] }
    /** A derived kind (see `KindFrom`). */
    | { readonly kindFrom: string }
  ))[];
  readonly outputs: readonly ({
    readonly name: string;
    readonly array: boolean;
    readonly required: boolean;
  } & (
    | { readonly payloadKind: PayloadKind }
    /** A derived kind (see `KindFrom`). */
    | { readonly kindFrom: string }
  ))[];
}

/** An input that lists the kinds it accepts. */
interface InputDefinition {
  readonly name: string;
  readonly oneOfPayloadKinds: readonly PayloadKind[];
  readonly array: boolean;
  readonly required: boolean;
  // oxlint-disable-next-line typescript/no-restricted-types -- a default is any value of the input's payload kind
  readonly default?: unknown;
}

type ActionInput = ActionDefinition["inputs"][number];

declare const refBrand: unique symbol;

/**
 * A typed handle to a value: a flow input, a step output, a `forEach` item or a constant. Connections are made
 * by passing refs, and the type parameters make an incompatible connection a compile error (see `canConnect`
 * for the rule they mirror).
 *
 * `IsRequired` means the value is always present once its producer has run.
 */
export interface Ref<
  Kind extends PayloadKind,
  IsArray extends boolean,
  IsRequired extends boolean,
> {
  /** Type-level only: carries the value's shape for assignability checks. */
  readonly [refBrand]?: {
    payloadKind: Kind;
    array: IsArray;
    required: IsRequired;
  };
  readonly source: StepInputSource;
  /* Method syntax: see the suppressions. `wrap`'s `this` parameter stops it being called on an array ref. */
  /** Leave the value available to other consumers. */
  // oxlint-disable-next-line typescript/method-signature-style -- method syntax compares parameters bivariantly, which keeps `Ref` covariant in its type parameters; property syntax breaks assignability of refs to inputs
  read(): Ref<Kind, IsArray, IsRequired>;
  /** Take the value, so no other consumer can. */
  // oxlint-disable-next-line typescript/method-signature-style -- method syntax compares parameters bivariantly, which keeps `Ref` covariant in its type parameters; property syntax breaks assignability of refs to inputs
  consume(): Ref<Kind, IsArray, IsRequired>;
  /** Wrap a singular value into a one-item array, to feed an array input. */
  // oxlint-disable-next-line typescript/method-signature-style -- method syntax compares parameters bivariantly, which keeps `Ref` covariant in its type parameters; property syntax breaks assignability of refs to inputs
  wrap(this: Ref<Kind, false, IsRequired>): Ref<Kind, true, IsRequired>;
  /**
   * Allow a value that may be missing to feed a required input, by skipping the consuming step (and
   * everything that depends on it) when the value is missing.
   */
  // oxlint-disable-next-line typescript/method-signature-style -- method syntax compares parameters bivariantly, which keeps `Ref` covariant in its type parameters; property syntax breaks assignability of refs to inputs
  orSkip(): Ref<Kind, IsArray, true>;
}

export type AnyRef = Ref<PayloadKind, boolean, boolean>;

/**
 * The refs an input accepts. A required input needs a value that is always present, even when it has a
 * default: the default only applies when nothing is connected.
 */
export type InputAccepts<Input extends InputDefinition> = Ref<
  Input["oneOfPayloadKinds"][number],
  Input["array"],
  Input["required"] extends true ? true : boolean
>;

type IsMandatory<Input extends ActionInput> = Input["required"] extends true
  ? // oxlint-disable-next-line typescript/no-restricted-types -- only the presence of a default matters, not its type
    Input extends { readonly default: unknown }
    ? false
    : true
  : false;

/** The input a definition takes its kind from, if it has a derived kind (see `KindFrom`). */
type KindSourceOf<Definition> = Definition extends {
  readonly kindFrom: infer Name;
}
  ? Name
  : never;

/**
 * Whether a step must connect an input: a mandatory input, or a kind source, which gives the kinds derived from it.
 * A kind source that's optional still has to be connected, though the value connected may be missing.
 */
type MustBeConnected<
  Action extends ActionDefinition,
  Input extends ActionInput,
> =
  IsMandatory<Input> extends true
    ? true
    : Input["name"] extends KindSourceOf<
          Action["inputs"][number] | Action["outputs"][number]
        >
      ? true
      : false;

type InputAcceptsInAction<
  Action extends ActionDefinition,
  Input extends ActionInput,
> = Ref<
  AcceptedKinds<Action["inputs"][number], Input>,
  Input["array"],
  Input["required"] extends true ? true : boolean
>;

export type StepInputs<Action extends ActionDefinition> = {
  [
    Input in Action["inputs"][number] as MustBeConnected<
      Action,
      Input
    > extends true
      ? Input["name"]
      : never
  ]: InputAcceptsInAction<Action, Input>;
} & {
  [
    Input in Action["inputs"][number] as MustBeConnected<
      Action,
      Input
    > extends true
      ? never
      : Input["name"]
  ]?: InputAcceptsInAction<Action, Input>;
};

/** The kind of a ref, or `never` if there's no ref. */
type RefKind<MaybeRef> =
  MaybeRef extends Ref<infer Kind, boolean, boolean> ? Kind : never;

/**
 * Narrows each input with a derived kind to accept only the kind of the ref given to its kind source.
 */
type DerivedKindInputs<Action extends ActionDefinition, InputRefs> = {
  [
    Input in Action["inputs"][number] as Input extends {
      readonly kindFrom: infer KindSourceName;
    }
      ? KindSourceName extends keyof InputRefs
        ? Input["name"]
        : never
      : never
  ]?: Input extends {
    readonly kindFrom: infer KindSourceName extends keyof InputRefs;
  }
    ? Ref<
        RefKind<InputRefs[KindSourceName]>,
        Input["array"],
        Input["required"] extends true ? true : boolean
      >
    : never;
};

/** Rejects inputs the action doesn't have. */
type NoUnknownInputs<Action extends ActionDefinition, InputRefs> = Record<
  Exclude<keyof InputRefs, Action["inputs"][number]["name"]>,
  never
>;

/**
 * The refs `step()` returns for a step's outputs.
 *
 * An output with a derived kind gets the kind of the ref given to its kind source.
 */
export type StepOutputs<
  Action extends ActionDefinition,
  // oxlint-disable-next-line typescript/no-restricted-types -- no input refs are known unless the caller passes them
  InputRefs = unknown,
> = {
  [Output in Action["outputs"][number] as Output["name"]]: Output extends {
    readonly payloadKind: infer Kind extends PayloadKind;
  }
    ? Ref<Kind, Output["array"], Output["required"]>
    : Output extends { readonly kindFrom: infer KindSourceName }
      ? Ref<
          KindSourceName extends keyof InputRefs
            ? RefKind<InputRefs[KindSourceName]>
            : never,
          Output["array"],
          Output["required"]
        >
      : never;
};

/**
 * The type of `step()`: adds an action step, and returns refs to its outputs.
 *
 * `InputRefs` is inferred from the refs given as inputs, so that a derived kind can be typed by the ref given to its
 * kind source.
 */
export type AddStep = <Action extends ActionDefinition, InputRefs>(
  id: string,
  action: Action,
  options: {
    description: string;
    inputs: InputRefs &
      StepInputs<Action> &
      DerivedKindInputs<Action, InputRefs> &
      NoUnknownInputs<Action, InputRefs>;
    retryCount?: number;
  },
) => { outputs: StepOutputs<Action, InputRefs> };

export type AddForEach = <
  Kind extends PayloadKind,
  CollectedKind extends PayloadKind,
>(
  id: string,
  over: Ref<Kind, true, true>,
  options: {
    description: string;
    /** The name of the collected output. */
    collectAs: string;
    /**
     * Adds the steps that run for each item, and returns the output to collect from each run into an array:
     * singular outputs are gathered, and array outputs concatenated. It must always be present.
     */
    steps: (
      item: Ref<Kind, false, true>,
      scope: ForEachScope,
    ) => Ref<CollectedKind, boolean, true>;
  },
) => Ref<CollectedKind, true, true>;

export interface StepScope {
  step: AddStep;
  forEach: AddForEach;
}

/**
 * What a for-each step's nested steps can add. A for-each step can't contain another one until the Petri net
 * executor (FE-1904) runs flows.
 */
export type ForEachScope = Pick<StepScope, "step">;

/**
 * A flow input declared with `flowInput`, before it is named by its key in `defineFlow`.
 */
export interface FlowInputDeclaration<
  Kind extends PayloadKind,
  IsArray extends boolean,
  IsRequired extends boolean,
> {
  readonly definition: Omit<FlowInputDefinition, "name">;
  readonly [refBrand]?: {
    payloadKind: Kind;
    array: IsArray;
    required: IsRequired;
  };
}

export type FlowInputRefs<
  Inputs extends Record<
    string,
    FlowInputDeclaration<PayloadKind, boolean, boolean>
  >,
> = {
  [InputName in keyof Inputs]: Inputs[InputName] extends FlowInputDeclaration<
    infer Kind,
    infer IsArray,
    infer IsRequired
  >
    ? Ref<Kind, IsArray, IsRequired>
    : never;
};
