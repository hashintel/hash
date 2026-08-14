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
      : [Value] extends [ReadonlyArray<unknown>]
        ? { [Index in keyof Value]: InputFor<Value[Index]> }
        : Input | ReadonlyArray<Input> | null;

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
