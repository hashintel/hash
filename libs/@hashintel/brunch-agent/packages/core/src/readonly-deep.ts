/** Recursively expose a parsed data contract as immutable. */
export type ReadonlyDeep<
  Value,
  Depth extends readonly unknown[] = [],
> = Depth["length"] extends 8
  ? Value
  : Value extends readonly unknown[]
    ? {
        readonly [Index in keyof Value]: ReadonlyDeep<
          Value[Index],
          readonly [unknown, ...Depth]
        >;
      }
    : Value extends object
      ? {
          readonly [Key in keyof Value]: ReadonlyDeep<
            Value[Key],
            readonly [unknown, ...Depth]
          >;
        }
      : Value;
