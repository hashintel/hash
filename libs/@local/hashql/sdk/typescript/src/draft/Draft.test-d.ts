import { Result } from "effect";
// oxlint-disable unicorn/no-thenable -- then is the HashQL conditional-branch key
import { describe, expectTypeOf, test } from "vitest";

import { Expression, Module, Prelude, Structural } from "../main.js";
import * as Fixtures from "./fixtures.js";
import * as Draft from "./index.js";

import type { Inputs, Type, TypeExpression } from "../main.js";

const integer = Structural.type(BigInt);
const string = Structural.type(String);

// oxlint-disable-next-line typescript/promise-function-async -- this fixture supplies a Promise where the synchronous API rejects one
const asynchronousBody = (): Promise<
  Expression.Expression<Type.PrimitiveBoolean, Inputs.Empty>
> => Promise.resolve(Expression.literal(true));

const alternative = <A, B>(left: A, _right: B): A | B => left;

describe("draft_types", () => {
  test("conservative_inputs", () => {
    const result = Draft.program(
      { count: integer, label: string },
      ($, inputs) => {
        expectTypeOf(inputs.count).toEqualTypeOf<
          Expression.Expression<
            Type.PrimitiveInteger,
            { readonly count: Type.PrimitiveInteger }
          >
        >();
        $.let("discarded", inputs.count);
        return $.literal(true);
      },
    );
    expectTypeOf(Result.getOrThrow(result)).toEqualTypeOf<
      Expression.Expression<
        Type.PrimitiveBoolean,
        {
          readonly count: Type.PrimitiveInteger;
          readonly label: Type.PrimitiveString;
        }
      >
    >();
    expectTypeOf(
      Result.getOrThrow(Draft.program({}, ($) => $.literal(true))),
    ).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveBoolean, Inputs.Empty>
    >();
  });

  test("schema_checks", () => {
    const outside = Expression.input("outside", integer);
    const optional = Expression.input("optional", integer, 1n);
    // @ts-expect-error undeclared final input
    Draft.program({}, () => outside);
    Draft.program({}, ($) => {
      // @ts-expect-error discarded initializer still requires an input
      $.let("lost", outside);
      // @ts-expect-error the schema must include optional external inputs
      $.let("optional", optional);
      $.if(
        true,
        // @ts-expect-error child final expression contains an undeclared input
        () => outside,
        () => 1n,
      );
      // @ts-expect-error direct branch contains an undeclared input
      $.if(true, { then: outside, else: 1n });
      return $.literal(true);
    });
    Draft.program({ outside: integer }, ($) => $.let("allowed", outside));
    const selected = alternative(outside, Expression.input("other", integer));
    const composed = Expression.ifElse(true, { then: selected, else: 1n });
    expectTypeOf(composed);
    // @ts-expect-error composition cannot erase alternative undeclared inputs
    Draft.program({}, ($) => $.let("lostAlternative", composed));
    // @ts-expect-error same input name with incompatible type
    Draft.program({ outside: string }, () => outside);
    // @ts-expect-error async callbacks do not construct programs
    Draft.program({}, asynchronousBody);
  });

  test("nominal_identity", () => {
    const identity = Symbol("Foo");
    const otherIdentity = Symbol("Foo");
    Draft.program({ count: integer }, ($, inputs) => {
      const Foo = $.newtype("Foo", identity, { foo: BigInt });
      const Other = $.newtype("Foo", otherIdentity, { foo: BigInt });
      const widened: symbol = identity;
      // @ts-expect-error a widened symbol cannot supply a distinct nominal identity
      $.newtype("Wide", widened, BigInt);
      // @ts-expect-error semantic descriptors are not runtime type definitions
      $.type("Phantom", { _tag: "Integer" });
      const value = Foo({ foo: inputs.count });
      expectTypeOf<Expression.Inputs<typeof value>>().toEqualTypeOf<{
        readonly count: Type.PrimitiveInteger;
      }>();
      // @ts-expect-error primitive host number is not Integer
      Foo({ foo: 2 });
      // @ts-expect-error missing structural field
      Foo({});
      // @ts-expect-error extra structural field is not an exact ascription
      Foo({ foo: 2n, extra: true });
      // @ts-expect-error distinct unique symbols retain nominal identity
      const mismatch: typeof value = Other({ foo: inputs.count });
      expectTypeOf(mismatch);
      // @ts-expect-error cannot substitute a plain underlying record for nominal value
      const underlying: typeof value = $.literal(2n);
      expectTypeOf(underlying);
      return value;
    });
  });

  test("metadata_types", () => {
    const custom = Result.getOrThrow(
      Module.define("::custom", {
        types: { Shared: Module.type<Type.PrimitiveInteger>() },
        values: {
          Shared:
            Module.value<
              Type.Struct<{ readonly syntax: Type.PrimitiveInteger }>
            >(),
        },
      }),
    );
    Draft.withPrelude(custom).program({}, ($) => {
      const { Shared } = $.prelude();
      // @ts-expect-error metadata is a Result, not also an expression handle
      const impossible: Expression.Any = Shared.syntax;
      expectTypeOf(impossible);
      return Shared.$project("syntax");
    });
  });

  test("prelude_capabilities", () => {
    Fixtures.program({ axis: Fixtures.axis }, ($, inputs) => {
      const { Uuid, EntityUuid, eq, add, List, Integer } = $.prelude();
      const comparison = $.let("comparison", EntityUuid(Uuid("uuid")));
      const list = List(Integer);
      expectTypeOf(list).toEqualTypeOf<
        TypeExpression.TypeExpression<Type.List<Type.PrimitiveInteger>>
      >();
      // @ts-expect-error arithmetic excludes strings
      add("one", "two");
      // @ts-expect-error List has one type argument
      List(Integer, Integer);
      // @ts-expect-error module keys remain precise
      expectTypeOf($.modules().uuid.UnknownExport);
      const hidden = Expression.input("hidden", Prelude.builtin.types.Boolean);
      $.query.entities(inputs.axis).filter(
        "vertex",
        // @ts-expect-error predicate final expressions must fit the schema
        () => hidden,
      );
      $.query.entities(inputs.axis).filter("vertex", (predicate) => {
        // @ts-expect-error discarded predicate declarations must fit the schema
        predicate.let("hidden", hidden);
        return true;
      });
      // @ts-expect-error nominal constructor requires a Uuid
      EntityUuid("uuid");
      return $.query
        .entities(inputs.axis)
        .filter("vertex", (branch, vertex) => {
          const selected = branch.let(
            "selected",
            vertex.metadata.record_id.entity_id.entity_uuid,
          );
          return eq(selected, comparison);
        })
        .collect();
    });
    Draft.withPrelude({}).program({}, ($) => {
      // @ts-expect-error custom prelude replaces builtins
      expectTypeOf($.prelude().Uuid);
      return $.literal(true);
    });
  });
});
