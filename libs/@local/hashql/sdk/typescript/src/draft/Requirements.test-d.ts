import { Result } from "effect";
// oxlint-disable unicorn/no-thenable -- then names a HashQL branch or declared export
import { describe, expectTypeOf, test } from "vitest";

import { Expression, Module, Prelude, Structural } from "../main.js";
import * as Operators from "../program/Operators.js";
import * as Fixtures from "./fixtures.js";
import * as Draft from "./index.js";

import type { Inputs, Type } from "../main.js";

const integer = Structural.type(BigInt);
const outside = Expression.input("outside", integer);
type Box = Type.Struct<{ readonly foo: Type.PrimitiveInteger }>;

const chooseBox = ():
  | { readonly foo: Expression.Expression<Type.PrimitiveInteger, Inputs.Empty> }
  | { readonly foo: typeof outside } => ({ foo: outside });

const chooseTuple = ():
  | readonly [Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>]
  | readonly [typeof outside] => [outside];

const alternative = <A, B>(left: A, _right: B): A | B => left;
const chooseAxes = ():
  | Inputs.Empty
  | { readonly axis: typeof Fixtures.axis } => ({ axis: Fixtures.axis });

const chooseSchema = ():
  | Inputs.Empty
  | { readonly outside: typeof integer } => ({ outside: integer });

describe("draft_requirements", () => {
  test("structural_alternatives", () => {
    const structural = Structural.value<Box>()(chooseBox());
    // @ts-expect-error a closed annotation cannot discard the required host alternative
    const closed: Expression.Expression<Box, Inputs.Empty> = structural;
    expectTypeOf(closed);
    expectTypeOf<Expression.Inputs<typeof structural>>().toEqualTypeOf<{
      readonly outside: Type.PrimitiveInteger;
    }>();
    const tuple =
      Structural.value<Type.Tuple<readonly [Type.PrimitiveInteger]>>()(
        chooseTuple(),
      );
    // @ts-expect-error tuple alternatives also keep every requirement
    const closedTuple: Expression.Expression<
      Expression.TypeOf<typeof tuple>,
      Inputs.Empty
    > = tuple;
    expectTypeOf(closedTuple);
    const identity = Symbol("Box");
    Draft.program({}, ($) => {
      const Nominal = $.newtype("Box", identity, { foo: BigInt });
      const nominal = Nominal(chooseBox());
      // @ts-expect-error the nominal producer normalizes before exposing variance
      const closedNominal: Expression.Expression<
        Expression.TypeOf<typeof nominal>,
        Inputs.Empty
      > = nominal;
      expectTypeOf(closedNominal);
      // @ts-expect-error discarded nominal initializers still need their inputs
      $.let("lost", nominal);
      // @ts-expect-error discarded structural initializers still need their inputs
      $.let("lostStruct", structural);
      return $.literal(true);
    });
    Draft.program({ outside: integer }, ($) => $.let("allowed", structural));
  });

  test("erased_requirements", () => {
    const erased: Expression.Any = outside;
    const erasedValue: Expression.Value<Type.PrimitiveInteger> = outside;
    const conditional = Expression.ifElse(true, {
      then: erasedValue,
      else: 1n,
    });
    const assumed = Expression.assume<Type.PrimitiveInteger>()(erased);
    const structural = Structural.value<Box>()({ foo: erasedValue });
    const call = Prelude.builtin.values.add(erasedValue, 1n);
    const defaulted = Expression.input("defaulted", integer, erasedValue);
    const erasedReceiver: Expression.Expression<Type.PrimitiveInteger, never> =
      outside;
    const receiverCall = Operators.eq(erasedReceiver, outside);
    const erasedCallee: Expression.Expression<
      Expression.TypeOf<typeof Prelude.builtin.values.add>,
      never
    > = Prelude.builtin.values.add;
    const calleeCall = erasedCallee(outside, 1n);
    const mixedAny = Expression.ifElse(true, { then: erased, else: 1n });
    const chooseErasedTuple = ():
      | readonly [typeof erasedValue]
      | readonly [bigint] => [erasedValue];
    const erasedTuple =
      Structural.value<Type.Tuple<readonly [Type.PrimitiveInteger]>>()(
        chooseErasedTuple(),
      );
    // @ts-expect-error an outer tuple alternative must not discard internal erasure
    const closedTuple: Expression.Expression<
      Expression.TypeOf<typeof erasedTuple>,
      Inputs.Empty
    > = erasedTuple;
    expectTypeOf(closedTuple);
    // @ts-expect-error a named argument cannot discharge an erased receiver
    const closedReceiver: Expression.Expression<
      Type.PrimitiveBoolean,
      { readonly outside: Type.PrimitiveInteger }
    > = receiverCall;
    // @ts-expect-error a named argument cannot discharge an erased callee
    const closedCallee: Expression.Expression<
      Expression.TypeOf<typeof calleeCall>,
      { readonly outside: Type.PrimitiveInteger }
    > = calleeCall;
    // @ts-expect-error a primitive branch cannot discharge an erased expression
    const closedAny: Expression.Expression<
      Expression.TypeOf<typeof mixedAny>,
      Inputs.Empty
    > = mixedAny;
    expectTypeOf(closedReceiver);
    expectTypeOf(closedCallee);
    expectTypeOf(closedAny);
    const mixed = Expression.ifElse(true, {
      then: alternative(erasedValue, Expression.integer(1)),
      else: 1n,
    });
    // @ts-expect-error conditional composition must not convert erasure to Empty
    const closed: Expression.Expression<
      Expression.TypeOf<typeof conditional>,
      Inputs.Empty
    > = conditional;
    // @ts-expect-error structural composition must not convert erasure to Empty
    const closedStruct: Expression.Expression<Box, Inputs.Empty> = structural;
    // @ts-expect-error argument composition must not convert erasure to Empty
    const closedCall: Expression.Expression<
      Expression.TypeOf<typeof call>,
      Inputs.Empty
    > = call;
    // @ts-expect-error the unknown host alternative cannot disappear
    const closedMixed: Expression.Expression<
      Expression.TypeOf<typeof mixed>,
      Inputs.Empty
    > = mixed;
    expectTypeOf(closed);
    expectTypeOf(closedStruct);
    expectTypeOf(closedCall);
    expectTypeOf(closedMixed);
    // @ts-expect-error erased program output cannot prove the schema contract
    Draft.program({ outside: integer }, () => erased);
    Draft.program({ outside: integer, defaulted: integer }, ($) => {
      // @ts-expect-error even a matching schema cannot recover erased information
      $.let("any", erased);
      // @ts-expect-error Value<T> erases requirements too
      $.let("value", erasedValue);
      // @ts-expect-error conditional composition retains erasure
      $.let("conditional", conditional);
      // @ts-expect-error semantic assumptions do not recover input requirements
      $.let("assumed", assumed);
      // @ts-expect-error structural composition retains erasure
      $.let("structural", structural);
      // @ts-expect-error calls retain erasure
      $.let("call", call);
      // @ts-expect-error input defaults retain erasure
      $.let("defaulted", defaulted);
      // @ts-expect-error callee requirements remain erased after argument composition
      $.let("callee", calleeCall);
      // @ts-expect-error receiver requirements remain erased after operand composition
      $.let("receiver", receiverCall);
      const identity = Symbol("Erased");
      const Nominal = $.newtype("Erased", identity, { foo: BigInt });
      const nominal = Nominal({ foo: erasedValue });
      // @ts-expect-error nominal composition cannot restore erased requirements
      const closedNominal: Expression.Expression<
        Expression.TypeOf<typeof nominal>,
        Inputs.Empty
      > = nominal;
      expectTypeOf(closedNominal);
      // @ts-expect-error nominal initializers retain erased requirements
      $.let("nominal", nominal);
      // @ts-expect-error direct branches cannot accept erased values
      $.if(true, { then: erasedValue, else: 1n });
      $.if(
        true,
        // @ts-expect-error callback branches cannot accept erased values
        () => erasedValue,
        () => 1n,
      );
      return $.literal(true);
    });
    const erasedPredicate: Expression.Value<Type.PrimitiveBoolean> =
      Expression.input("flag", Structural.type(Boolean));
    Fixtures.program({ axis: Fixtures.axis }, ($, inputs) => {
      // @ts-expect-error query callbacks cannot prove erased requirements
      $.query.entities(inputs.axis).filter("vertex", () => erasedPredicate);
      return $.literal(true);
    });
  });

  test("schema_alternatives", () => {
    const result = Draft.program(chooseSchema(), ($) => $.literal(true));
    // @ts-expect-error an empty alternative does not remove the explicit schema promise
    const closed: Expression.Expression<Type.PrimitiveBoolean, Inputs.Empty> =
      Result.getOrThrow(result);
    expectTypeOf(closed);
    const output = Result.getOrThrow(result);
    expectTypeOf<Expression.Inputs<typeof output>>().toEqualTypeOf<{
      readonly outside: Type.PrimitiveInteger;
    }>();
    const branch = Draft.program(chooseSchema(), ($) =>
      $.if(
        true,
        (child) => child.let("outside", outside),
        () => 1n,
      ),
    );
    // @ts-expect-error child contexts retain the conservative schema
    const closedBranch: Expression.Expression<
      Type.PrimitiveInteger,
      Inputs.Empty
    > = Result.getOrThrow(branch);
    expectTypeOf(closedBranch);
    const axis = Expression.input("axis", Fixtures.axis);
    Fixtures.program(chooseAxes(), ($) => {
      const query = $.query
        .entities(axis)
        .filter("vertex", (predicate) => predicate.let("selected", true));
      // @ts-expect-error query contexts retain the same conservative schema
      const closedQuery: Expression.Expression<
        Expression.TypeOf<typeof query>,
        Inputs.Empty
      > = query;
      expectTypeOf(closedQuery);
      return query.collect();
    });
  });

  test("joined_expression_operations", () => {
    const child = Result.getOrThrow(
      Module.define("::child", {
        values: {
          then: Module.value<Type.PrimitiveInteger>(),
          $: Module.value<Type.PrimitiveInteger>(),
        },
      }),
    );
    Draft.withPrelude({
      modules: { Both: child },
      values: { Both: outside },
    }).program({ outside: integer }, ($) => {
      const { Both } = $.prelude();
      const thenValue = Both.then;
      const dollarValue = Both.$;
      expectTypeOf(dollarValue).toEqualTypeOf<typeof child.values.$>();
      expectTypeOf(Both).not.toHaveProperty("$project");
      expectTypeOf(Both).not.toHaveProperty("$index");
      expectTypeOf($.modules().Both.then).toEqualTypeOf<
        typeof child.values.then
      >();
      expectTypeOf(thenValue).toEqualTypeOf<typeof child.values.then>();
      expectTypeOf(dollarValue);
      expectTypeOf(Both.values.then).toEqualTypeOf<
        Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
      >();
      return $.literal(true);
    });
  });
});
