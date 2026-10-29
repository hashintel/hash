import { Brand, MutableHashMap, Number, Option, Predicate, flow } from "effect";

import type * as Ident from "../JExpr/Ident.js";
import type * as Path from "../JExpr/Path.js";

/** HashQL keeps value, type and module names apart, so a binding in one universe never shadows a name in another. A path that continues past its first segment resolves that segment among modules. */
export type Universe = "value" | "type" | "module";

export type Generation = number & Brand.Brand<"Generation">;
const Generation = Brand.nominal<Generation>();

export interface ReferenceId<U extends Universe = Universe> {
  readonly source: symbol;
  readonly universe: U;
  readonly ident: Ident.Ident;
  readonly generation: Generation;
}

export const References: unique symbol = Symbol("~hashql/References");
export type ReferenceProducer = <U extends Universe>(
  universe: U,
  ident: Ident.Ident,
) => ReferenceId<U>;

export const referenceProducer = (source: symbol): ReferenceProducer => {
  const references = MutableHashMap.empty<[Universe, Ident.Ident], number>();

  return <U extends Universe>(
    universe: U,
    ident: Ident.Ident,
  ): ReferenceId<U> => {
    MutableHashMap.modifyAt(
      references,
      [universe, ident],
      flow(
        Option.map(Number.increment),
        Option.getOrElse(() => 0),
        Option.some,
      ),
    );

    // oxlint-disable-next-line typescript/no-non-null-assertion -- always Some because of the prior statement
    const generation = MutableHashMap.get(references, [
      universe,
      ident,
    ]).valueOrUndefined!;

    return {
      source,
      universe,
      ident,
      generation: Generation(generation),
    };
  };
};

export interface Referential {
  readonly [References]: readonly ReferenceId[];
}

// oxlint-disable-next-line typescript/no-restricted-types -- used to determine if a value is a `Referencing`
export const isReferential = (value: unknown): value is Referential =>
  Predicate.hasProperty(value, References);

/** The ids one name is bound to, one per universe, such as the bindings an import's local name has. */
export type Bound = { readonly [U in Universe]?: ReferenceId<U> };

/**
 * Returns the id a handle at `path` keeps: the binding its first segment resolves to.
 *
 * A one-segment path is the handle's own name, so it resolves in the handle's universe. A longer path resolves its first segment among modules.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- reads the id a path's first segment names
export const head = (
  path: Path.Path,
  universe: Universe,
  bound: Bound | undefined,
): ReferenceId | undefined => {
  if (path.segments.length > 1) {
    return bound?.module;
  }

  return bound?.[universe];
};
