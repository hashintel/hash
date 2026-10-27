/**
 * Generic entries that a reference attaches to its last path segment: a positional argument or a named bound.
 *
 * {@link argument} and {@link bound} build an entry. {@link make} checks a decoded `GenericArgument` or `GenericBound` object rather than source text. {@link makeEffect} fails with the {@link SchemaIssue.Issue} instead of throwing. {@link makeOption} returns `None` instead.
 *
 * @module
 */
import { Option, Result } from "effect";

import * as Overflow from "../../internal/overflow.js";
import * as Ident from "../Ident.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, SchemaIssue } from "effect";

export const Schema: typeof Defs.Generic = Defs.Generic;

export type Generic = Defs.GenericType;

export declare namespace Generic {
  export type Encoded = Defs.GenericEncoded;
}

type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a decoded generic entry object and returns it.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Generic =
  Overflow.make(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Generic, SchemaIssue.Issue> = Overflow.makeEffect(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Generic> = Overflow.makeOption(Schema);

/**
 * Creates a generic argument: the `Integer` in `List<Integer>`.
 */
export const argument = (type: Defs.Type): Defs.GenericArgumentType => ({
  _tag: "GenericArgument",
  bound: type,
});

/**
 * Creates a named generic constraint: the `T: Integer` in `Foo<T: Integer>`.
 *
 * Returns `None` if `name` is not a valid identifier according to `Ident.decodeResult`. Without a bound, it compiles to the bare name, which HashQL parses as a generic argument. A declaration name such as `Pair<T>` reads that bare name as an unbounded parameter.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const bound = (
  name: string,
  type?: Defs.Type,
): Option.Option<Defs.GenericBoundType> =>
  Option.map(
    Ident.decodeResult(name).pipe(Result.getSuccess),
    (ident): Defs.GenericBoundType => {
      if (type === undefined) {
        return { _tag: "GenericBound", name: ident };
      }

      return { _tag: "GenericBound", name: ident, bound: type };
    },
  );
