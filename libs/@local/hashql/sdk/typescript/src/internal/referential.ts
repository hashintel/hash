import { Brand, MutableHashMap, Number, Option, Predicate, flow } from "effect";

import type * as Ident from "../JExpr/Ident.js";

export type Universe = "value" | "type";

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
