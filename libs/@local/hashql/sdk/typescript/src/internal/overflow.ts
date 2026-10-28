/**
 * Schema constructors that report a call stack overflow as a schema issue.
 *
 * Effect validates a recursive schema with one level of recursion per level of input nesting, so input nested deep enough exhausts the call stack. How deep that is depends on the engine and on how much stack the caller already holds. These functions therefore let the engine find the limit and return the overflow as the failure each function already has. Each one has the signature of its `SchemaParser` namesake. Running one of our schemas through Effect's own API still lets the overflow escape, which is Effect's behaviour to define.
 *
 * @internal
 */
import { Effect, Result, SchemaIssue, SchemaParser } from "effect";

import type { Option, Schema } from "effect";

/** Checks whether a thrown value is a call stack overflow. V8 and JavaScriptCore throw a `RangeError` and SpiderMonkey an `InternalError`. */
// oxlint-disable-next-line typescript/no-restricted-types -- A thrown value or an Effect defect can be any value.
export const isStackOverflow = (error: unknown): boolean =>
  error instanceof RangeError ||
  (error instanceof Error && error.name === "InternalError");

const recover = <A, R>(
  effect: Effect.Effect<A, SchemaIssue.Issue, R>,
): Effect.Effect<A, SchemaIssue.Issue, R> =>
  Effect.catchDefect(effect, (defect) => {
    if (isStackOverflow(defect)) {
      return Effect.fail(
        new SchemaIssue.InvalidValue({
          message: "Input nesting exhausted the call stack",
        }),
      );
    }

    return Effect.die(defect);
  });

/** Validates the schema's decoded type side, with a stack overflow in the failure channel. */
export const makeEffect = <S extends Schema.Constraint>(schema: S) => {
  const run = SchemaParser.makeEffect(schema);
  return (
    input: S["~type.make.in"],
    options?: Schema.MakeOptions,
  ): Effect.Effect<S["Type"], SchemaIssue.Issue> =>
    recover(Effect.suspend(() => run(input, options)));
};

/** Validates the schema's decoded type side, returning `None` for a schema issue or a stack overflow. */
export const makeOption = <S extends Schema.Constraint>(schema: S) => {
  const run = makeEffect(schema);
  return (
    input: S["~type.make.in"],
    options?: Schema.MakeOptions,
  ): Option.Option<S["Type"]> =>
    Effect.runSync(Effect.option(run(input, options)));
};

/**
 * Validates the schema's decoded type side.
 *
 * @throws {Error} If validation fails or exhausts the call stack. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
export const make = <S extends Schema.Constraint>(schema: S) => {
  const run = makeEffect(schema);
  return (input: S["~type.make.in"], options?: Schema.MakeOptions): S["Type"] =>
    Result.getOrThrowWith(
      Effect.runSync(Effect.result(run(input, options))),
      (issue) => new Error("Schema validation failed", { cause: issue }),
    );
};
