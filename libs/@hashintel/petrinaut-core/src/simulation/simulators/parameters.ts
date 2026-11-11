import type { StepperParameters } from "../event-trace";

type ParameterRow = {
  readonly label: string;
  /** A sentence for the field's info tooltip. */
  readonly description?: string;
  /** The field shows only while another parameter holds one of these values. */
  readonly enabledWhen?: {
    readonly key: string;
    readonly in: readonly (string | boolean)[];
  };
};

/**
 * One parameter a simulator takes, as the picker renders it. The plugin
 * API's setting spec, with numbers added.
 */
export type SimulatorParameterSpec =
  | (ParameterRow & {
      readonly type: "number";
      readonly default: number;
      readonly min?: number;
      readonly max?: number;
      /** True when `min` itself is not allowed, as for a step size above 0. */
      readonly exclusiveMin?: boolean;
      readonly unit?: string;
      /** How a stepper or a slider moves through the range. */
      readonly scale?: "linear" | "log";
    })
  | (ParameterRow & {
      readonly type: "integer";
      readonly default: number;
      readonly min?: number;
      readonly max?: number;
    })
  | (ParameterRow & { readonly type: "boolean"; readonly default: boolean })
  | (ParameterRow & {
      readonly type: "enum";
      readonly options: readonly {
        readonly value: string;
        readonly label: string;
      }[];
      /** One of `options`. */
      readonly default: string;
    });

export type SimulatorParameterSpecs = Readonly<
  Record<string, SimulatorParameterSpec>
>;

type ParameterValue<Spec> = Spec extends { readonly type: "boolean" }
  ? boolean
  : Spec extends {
        readonly type: "enum";
        readonly options: readonly { readonly value: infer Value }[];
      }
    ? Value
    : number;

/** The values a simulator receives, typed by its spec. */
export type SimulatorParameterValues<
  Specs extends SimulatorParameterSpecs = SimulatorParameterSpecs,
> = { readonly [Key in keyof Specs]: ParameterValue<Specs[Key]> };

/** Values as a form holds them, a setting stores them, or a message carries them. */
export type StoredSimulatorParameters = StepperParameters;

export type SimulatorParameterProblem = {
  readonly key: string;
  readonly message: string;
};

export type ResolvedSimulatorParameters<
  Specs extends SimulatorParameterSpecs,
> =
  | { readonly ok: true; readonly values: SimulatorParameterValues<Specs> }
  | {
      readonly ok: false;
      readonly problems: readonly [
        SimulatorParameterProblem,
        ...SimulatorParameterProblem[],
      ];
    };

/** Every parameter at its default. */
export const defaultSimulatorParameters = (
  specs: SimulatorParameterSpecs,
): StoredSimulatorParameters =>
  Object.fromEntries(
    Object.entries(specs).map(([key, spec]) => [key, spec.default]),
  );

const problemOf = (
  spec: SimulatorParameterSpec,
  value: number | boolean | string,
): string | null => {
  if (spec.type === "boolean") {
    return typeof value === "boolean" ? null : `${spec.label} is on or off`;
  }
  if (spec.type === "enum") {
    return spec.options.some((option) => option.value === value)
      ? null
      : `${spec.label} is not one of its options`;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `${spec.label} is a number`;
  }
  if (spec.type === "integer" && !Number.isInteger(value)) {
    return `${spec.label} is a whole number`;
  }
  if (spec.min !== undefined) {
    const exclusive = spec.type === "number" && spec.exclusiveMin === true;
    if (value < spec.min || (exclusive && value === spec.min)) {
      return `${spec.label} is ${exclusive ? "above" : "at least"} ${spec.min}`;
    }
  }
  if (spec.max !== undefined && value > spec.max) {
    return `${spec.label} is at most ${spec.max}`;
  }
  return null;
};

/**
 * Fills defaults, drops keys the spec does not declare, and checks every
 * value against its spec. A form calls it on each edit to mark a field; a
 * run starts only from an `ok` result.
 */
export const resolveSimulatorParameters = <
  const Specs extends SimulatorParameterSpecs,
>(
  specs: Specs,
  stored: StoredSimulatorParameters,
): ResolvedSimulatorParameters<Specs> => {
  const values: Record<string, number | boolean | string> = {};
  const problems: SimulatorParameterProblem[] = [];
  for (const [key, spec] of Object.entries(specs)) {
    const value = stored[key] ?? spec.default;
    values[key] = value;
    const message = problemOf(spec, value);
    if (message !== null) {
      problems.push({ key, message });
    }
  }
  const [first, ...rest] = problems;
  return first === undefined
    ? { ok: true, values: values as SimulatorParameterValues<Specs> }
    : { ok: false, problems: [first, ...rest] };
};
