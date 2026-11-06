import type { Brand } from "effect";

declare const InternedType: unique symbol;

/** An identity within one AST, with its target type carried only at compile time. */
export type Interned<T> = number &
  Brand.Brand<"Interned"> & {
    readonly [InternedType]: T;
  };
