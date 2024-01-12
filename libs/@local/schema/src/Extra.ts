/* eslint-disable unicorn/filename-case */
import { Arbitrary, AST, ParseResult, Pretty } from "@effect/schema";
import * as Equivalence from "@effect/schema/Equivalence";
import * as S from "@effect/schema/Schema";
import { Either } from "effect";

import * as Uuid from "./Uuid";

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const uuidFromSelf: S.Schema<Uuid.Uuid> = S.declare(
  [],
  S.struct({ value: S.Uint8ArrayFromSelf.pipe(S.length(16)) }),
  () => (value, _, ast) =>
    Uuid.isUuid(value)
      ? ParseResult.succeed(value)
      : ParseResult.fail(ParseResult.type(ast, value)),
  {
    [AST.IdentifierAnnotationId]: "Uuid",
    [Pretty.PrettyHookId]: (): Pretty.Pretty<Uuid.Uuid> => (value) =>
      String(value),
    [Arbitrary.ArbitraryHookId]: (): Arbitrary.Arbitrary<Uuid.Uuid> => (fc) =>
      fc.oneof(
        fc.uuidV(1).map(Uuid.decode),
        fc.uuidV(3).map(Uuid.decode),
        fc.uuidV(4).map(Uuid.decode),
        fc.uuidV(5).map(Uuid.decode),
      ),
    [Equivalence.EquivalenceHookId]: () => Uuid.Equivalence,
  },
);

export const uuid = S.transformOrFail(
  S.string,
  uuidFromSelf,
  (value, _, ast) =>
    Either.match(Uuid.decodeEither(value), {
      onLeft: (error) =>
        ParseResult.fail(ParseResult.type(ast, value, error.message)),
      onRight: (ok) => ParseResult.succeed(ok),
    }),
  (value) => ParseResult.succeed(Uuid.toLowerHex(value)),
);
