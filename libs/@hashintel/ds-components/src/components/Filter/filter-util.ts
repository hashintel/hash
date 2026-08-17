import type { IconName } from "../Icon/icon";

/**
 * A static (non-value-bearing) segment between two inputs of a multi-input
 * operator: either literal text (e.g. "-") or an icon.
 */
export type InputSeparator = string | { iconName: IconName };

type TextInput = {
  type: "string";
  placeholder?: string;
  min?: number;
  max?: number;
  pattern?: string;
};
type NumberInput = {
  type: "number" | "int" | "float";
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
};

type Input = TextInput | NumberInput;

/**
 * The input config an operator must declare for its value type in the
 * ValueMap: string → a text input, number → a number input, a tuple → a
 * tuple of inputs mapped element-wise (`[string, number]` → a text input
 * then a number input), null → no input. Unknown value types accept any
 * input shape.
 */
export type InputFor<Value> = [Value] extends [null]
  ? null
  : [Value] extends [string]
    ? TextInput
    : [Value] extends [number]
      ? NumberInput
      : [Value] extends [infer Tuple extends ReadonlyArray<unknown>]
        ? InputArrayFor<Tuple>
        : Input | ReadonlyArray<Input | InputSeparator> | null;

/**
 * Tuple of inputs matching a value tuple element-wise, optionally with a
 * static string segment (rendered as separator text, e.g. "-") between
 * consecutive inputs. Separators carry no value, so they may only appear
 * between inputs — never leading or trailing.
 */
type InputArrayFor<Value extends ReadonlyArray<unknown>> =
  Value extends readonly [
    infer Head,
    ...infer Rest extends ReadonlyArray<unknown>,
  ]
    ? Rest extends readonly []
      ? readonly [InputFor<Head>]
      : readonly [
          InputFor<Head>,
          ...([] | [InputSeparator]),
          ...InputArrayFor<Rest>,
        ]
    : readonly [];

export type FilterValue<ValueMap extends Record<string, unknown>> = {
  [Key in keyof ValueMap & string]: { key: Key; value: ValueMap[Key] | null };
}[keyof ValueMap & string];

/**
 * Discriminated (key, value) argument pairs for the Filter-level `onChange`
 * — checking `key` in the handler narrows `value` to that operator's type.
 */
export type FilterChange<ValueMap extends Record<string, unknown>> =
  | {
      [Key in keyof ValueMap & string]: [key: Key, value: ValueMap[Key] | null];
    }[keyof ValueMap & string]
  | [key: null, value: null];
