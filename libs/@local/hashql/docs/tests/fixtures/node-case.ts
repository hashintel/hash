import { Array, Option } from "effect";

import type * as Interned from "../../src/AST/Interned.js";
import type * as Node from "../../src/AST/Node.js";
import type { Node as CompilerNode } from "typescript/ast";
import type { Symbol as CompilerSymbol } from "typescript/async";

// SAFETY: The fixtures compare these child identities without looking them up in an AST.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- No fixture dereferences this child identity.
export const firstHandle = 1 as Interned.Interned<never>;
// SAFETY: The fixtures compare these child identities without looking them up in an AST.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- No fixture dereferences this child identity.
export const secondHandle = 2 as Interned.Interned<never>;

/** One constructor's equal input and one change to each participating field. */
export interface NodeCase {
  readonly name: string;
  readonly make: () => Node.Node;
  readonly changes: readonly {
    readonly field: string;
    readonly make: () => Node.Node;
  }[];
  readonly trapped: Option.Option<() => Node.Node>;
}

/** Keeps each constructor paired with its input type before collecting heterogeneous cases. */
export const nodeCase = <F>({
  name,
  make,
  fields,
  changes,
  trapped,
}: {
  readonly name: string;
  readonly make: (fields: F) => Node.Node;
  readonly fields: NoInfer<F>;
  readonly changes: readonly {
    readonly field: string;
    readonly apply: (fields: NoInfer<F>) => NoInfer<F>;
  }[];
  readonly trapped?: (fields: NoInfer<F>) => NoInfer<F>;
}): NodeCase => ({
  name,
  make: () => make(fields),
  changes: Array.map(changes, (change) => ({
    field: change.field,
    make: () => make(change.apply(fields)),
  })),
  trapped: Option.fromUndefinedOr(trapped).pipe(
    Option.map((build) => () => make(build(fields))),
  ),
});

/** Fails if hashing or equality attempts to enumerate a compiler object's fields. */
export const shield = <T extends CompilerNode | CompilerSymbol>(value: T): T =>
  new Proxy(value, {
    ownKeys() {
      throw new Error("Compiler object was traversed");
    },
  });
