import type { PayloadKind } from "./types.js";

/**
 * The shape of a value that can feed an input: a step output, a flow input, a `forEach` item or a constant.
 */
export type ConnectionSource = {
  payloadKind: PayloadKind;
  array: boolean;
  /** Whether the value is always present when its producer has run. */
  required: boolean;
};

export type ConnectionTarget = {
  oneOfPayloadKinds: readonly PayloadKind[];
  array: boolean;
  required: boolean;
};

export type ConnectionProblem =
  | "payloadKind"
  | "arrayToSingular"
  | "singularToArray"
  | "wrapOnArray"
  | "optionalToRequired";

export type ConnectionCheck =
  | { ok: true }
  | { ok: false; problem: ConnectionProblem; message: string };

/**
 * Whether a value can feed an input. This is the one compatibility rule for flow connections: the validator,
 * and anything offering connections to a person, use it at runtime, and the typed builder's `Ref` types
 * mirror it at compile time (`define-flow.test.ts` checks both against the same cases).
 *
 * - The value's payload kind must be one the input accepts.
 * - Array-ness must match. A singular value may feed an array input only when explicitly wrapped; an array
 *   never feeds a singular input (iterate over it with `forEach` instead).
 * - A required input can only be fed by a value that is always present, unless the connection explicitly
 *   skips the consuming step when the value is missing. An input with a default is still required when
 *   connected, because the default only applies when nothing is connected.
 */
export const canConnect = ({
  source,
  target,
  wrap = false,
  skipWhenMissing = false,
}: {
  source: ConnectionSource;
  target: ConnectionTarget;
  wrap?: boolean;
  skipWhenMissing?: boolean;
}): ConnectionCheck => {
  if (!target.oneOfPayloadKinds.includes(source.payloadKind)) {
    return {
      ok: false,
      problem: "payloadKind",
      message: `A ${
        source.payloadKind
      } value cannot feed an input that accepts ${target.oneOfPayloadKinds.join(
        " or ",
      )}`,
    };
  }

  if (wrap && source.array) {
    return {
      ok: false,
      problem: "wrapOnArray",
      message: "Only a singular value can be wrapped into an array",
    };
  }

  const sourceIsArray = source.array || wrap;

  if (sourceIsArray && !target.array) {
    return {
      ok: false,
      problem: "arrayToSingular",
      message:
        "An array cannot feed a singular input: iterate over it with a forEach step instead",
    };
  }

  if (!sourceIsArray && target.array) {
    return {
      ok: false,
      problem: "singularToArray",
      message:
        "A singular value can only feed an array input when explicitly wrapped",
    };
  }

  if (target.required && !source.required && !skipWhenMissing) {
    return {
      ok: false,
      problem: "optionalToRequired",
      message:
        "A required input cannot be fed by a value that may be missing, unless the step is skipped when it is",
    };
  }

  return { ok: true };
};
