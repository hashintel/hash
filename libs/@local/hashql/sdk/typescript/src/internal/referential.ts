import { Brand, MutableHashMap, Number, Option, Predicate, flow } from "effect";

import * as Ident from "../JExpr/Ident.js";
import * as Path from "../JExpr/Path.js";

/** HashQL keeps value, type and module names apart, so a binding in one universe never shadows a name in another. A path that continues past its first segment resolves that segment among modules. */
export type Universe = "value" | "type" | "module";

/** How many ids the same producer made before this one for the same universe and name, counted from zero. */
export type Generation = number & Brand.Brand<"Generation">;
const Generation = Brand.nominal<Generation>();

/**
 * The identity of one binding, which a node or a handle keeps for each name its syntax reads.
 *
 * Ids whose source and generation agree name the same binding, because a producer never makes two ids with the same universe, name and generation. `AST.resolveReferences` relies on that when it compares a reference with the innermost binding of its universe and name. `ident` keeps the spelling the program emits.
 */
export interface ReferenceId<U extends Universe = Universe> {
  readonly source: symbol;
  readonly universe: U;

  readonly name: Ident.Name;
  readonly ident: Ident.Ident;

  readonly generation: Generation;
}

/** The one-segment path that spells a binding's name, as a reference to the binding emits it. */
export const bare = (name: Ident.Ident): Path.Path =>
  Path.make({ rooted: false, segments: [{ name, arguments: [] }] });

/** The key under which a node or a handle keeps its reference ids. */
export const References: unique symbol = Symbol("~hashql/References");

/** Makes the id of a new binding of `ident` in `universe`. */
export type ReferenceProducer = <U extends Universe>(
  universe: U,
  ident: Ident.Ident,
) => ReferenceId<U>;

/** Creates a producer whose ids carry `source` and number each universe and name's bindings in the order it makes them. */
export const referenceProducer = (source: symbol): ReferenceProducer => {
  const references = MutableHashMap.empty<[Universe, Ident.Name], number>();

  return <U extends Universe>(
    universe: U,
    ident: Ident.Ident,
  ): ReferenceId<U> => {
    const name = Ident.name(ident);

    MutableHashMap.modifyAt(
      references,
      [universe, name],
      flow(
        Option.map(Number.increment),
        Option.getOrElse(() => 0),
        Option.some,
      ),
    );

    // oxlint-disable-next-line typescript/no-non-null-assertion -- always Some because of the prior statement
    const generation = MutableHashMap.get(references, [
      universe,
      name,
    ]).valueOrUndefined!;

    return {
      source,
      universe,
      ident,
      name,
      generation: Generation(generation),
    };
  };
};

/** A value that keeps the ids of the bindings its own syntax names. */
export interface Referential {
  readonly [References]: readonly ReferenceId[];
}

/** Tests whether a value keeps reference ids. */
// oxlint-disable-next-line typescript/no-restricted-types -- used to determine if a value is a `Referencing`
export const isReferential = (value: unknown): value is Referential =>
  Predicate.hasProperty(value, References);
