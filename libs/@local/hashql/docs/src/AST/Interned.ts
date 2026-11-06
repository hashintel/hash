import type { Brand } from "effect";
import type { Symbol as CompilerSymbol } from "typescript/async";

declare const InternedType: unique symbol;

/** An identity within one AST, with its target type carried only at compile time. */
export type Interned<T> = number &
  Brand.Brand<"Interned"> & {
    readonly [InternedType]: T;
  };

/** A compiler symbol the AST holds a node for, with that node's type carried only at compile time. */
export type InternedSymbol<T> = CompilerSymbol &
  Brand.Brand<"InternedSymbol"> & {
    readonly [InternedType]: T;
  };
