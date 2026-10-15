import { Result, Schema, pipe } from "effect";
import { describe, expect, test } from "vitest";

import {
  Expression,
  JExpr,
  Module,
  Prelude,
  Program,
  TypeExpression,
} from "../main.js";
import * as Fixtures from "./fixtures.js";
import * as Draft from "./index.js";

import type { Inputs, ProgramError, Type } from "../main.js";

const compile = (
  result: Result.Result<Expression.Any, ProgramError.Construction>,
): Schema.Json =>
  pipe(
    result,
    Result.flatMap(Expression.toJExpr),
    Result.map(JExpr.compile),
    Result.getOrThrow,
    // oxlint-disable-next-line effecttsgo/schema-sync -- malformed emitted JSON must fail this synchronous test helper
    Schema.decodeSync(Schema.fromJsonString(Schema.Json)),
  );

// oxlint-disable-next-line typescript/promise-function-async -- this fixture supplies a Promise where the synchronous API rejects one
const asynchronousBody = (): Promise<
  Expression.Expression<Type.PrimitiveBoolean, Inputs.Empty>
> => Promise.resolve(Expression.literal(true));

interface IdentitySignature extends Type.FunctionSignature {
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.Function<readonly [T], T>
    : Type.Function<readonly [Type.Never], Type.Never>;
}

const call = (name: string, ...args: readonly Schema.Json[]): Schema.Json => [
  name,
  ...args,
];
const literal = (value: string | number | boolean): Schema.Json => ({
  "#literal": value,
});

describe("draft", () => {
  test("ordered_declarations", () => {
    expect.hasAssertions();
    let calls = 0;
    const identity = Symbol("Foo");
    const result = Draft.program({}, ($) => {
      calls += 1;
      const Count = $.type("Count", BigInt);
      const Foo = $.newtype("Foo", identity, { foo: Count });
      const value = $.let("value", Foo({ foo: 2n }));
      expect(TypeExpression.isExport(Foo)).toBe(true);
      expect(Expression.isExpression(Foo)).toBe(true);
      expect(TypeExpression.isExport(Count)).toBe(true);
      return value;
    });
    const output = Result.getOrThrow(
      Program.compile(Program.program(Result.getOrThrow(result))),
    );
    expect(JSON.parse(output)).toStrictEqual(
      call(
        "::kernel::special_form::type",
        "Count",
        "::kernel::type::Integer",
        call(
          "::kernel::special_form::newtype",
          "Foo",
          { "#struct": { foo: "Count" } },
          call(
            "::kernel::special_form::let",
            "value",
            call("Foo", { "#struct": { foo: literal(2) } }),
            "value",
          ),
        ),
      ),
    );
    compile(result);
    expect(calls).toBe(1);
  });

  test("branch_collectors", () => {
    expect.hasAssertions();
    const visits: string[] = [];
    const result = Draft.program({}, ($) =>
      $.if(
        false,
        (branch) => {
          visits.push("then");
          return branch.let("inside", branch.literal(1n));
        },
        (branch) => {
          visits.push("else");
          return branch.let("other", branch.literal(2n));
        },
      ),
    );
    expect(visits).toStrictEqual(["then", "else"]);
    expect(compile(result)).toStrictEqual(
      call(
        "::kernel::special_form::if",
        literal(false),
        call("::kernel::special_form::let", "inside", literal(1), "inside"),
        call("::kernel::special_form::let", "other", literal(2), "other"),
      ),
    );
    expect(
      // oxlint-disable-next-line unicorn/no-thenable -- then is the HashQL conditional-branch key
      compile(Draft.program({}, ($) => $.if(true, { then: 1n, else: 2n }))),
    ).toStrictEqual(
      call("::kernel::special_form::if", literal(true), literal(1), literal(2)),
    );
  });

  test("reentrant_collectors", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const outer = $.let("outer", 1n);
      const inner = Draft.program({}, (nested) => nested.let("inner", 2n));
      expect(compile(inner)).toStrictEqual(
        call("::kernel::special_form::let", "inner", literal(2), "inner"),
      );
      return $.if(
        true,
        (branch) =>
          branch.if(
            false,
            (child) => child.let("deep", outer),
            () => outer,
          ),
        () => outer,
      );
    });
    expect(JSON.stringify(compile(result))).not.toContain('"inner"');
    expect(JSON.stringify(compile(result))).toContain('"deep"');
  });

  test("custom_query_predicate", () => {
    expect.hasAssertions();
    const result = Fixtures.program({ axis: Fixtures.axis }, ($, inputs) => {
      const { EntityUuid, Uuid, eq } = $.prelude();
      expect($.prelude().Axis).toBe(Fixtures.axis);
      expect(TypeExpression.isExport(Uuid)).toBe(true);
      expect(Expression.isExpression(Uuid)).toBe(true);
      const comparison = $.let(
        "comparison",
        EntityUuid(Uuid("e2851dbb-7376-4959-9bca-f72cafc4448f")),
      );
      return $.query
        .entities(inputs.axis)
        .filter("vertex", (predicate, vertex) => {
          const selected = predicate.let(
            "selected",
            vertex.metadata.record_id.entity_id.entity_uuid,
          );
          return eq(selected, comparison);
        })
        .collect();
    });
    const syntax = JSON.stringify(compile(result));
    expect(syntax).toContain('"::test::graph::entities"');
    expect(syntax).toContain('"::test::graph::Axis"');
    expect(compile(result)).toStrictEqual([
      "::kernel::special_form::let",
      "comparison",
      expect.anything(),
      [
        "::graph::tail::collect",
        [
          "::graph::body::filter",
          expect.anything(),
          [
            "fn",
            { "#tuple": [] },
            { "#struct": { vertex: "_" } },
            "_",
            [
              "::kernel::special_form::let",
              "selected",
              expect.anything(),
              ["::core::cmp::eq", "selected", "comparison"],
            ],
          ],
        ],
      ],
    ]);
    expect(syntax).toContain('"::core::uuid::Uuid"');
  });

  test("custom_prelude", () => {
    expect.hasAssertions();
    const custom = Result.getOrThrow(
      Module.define("::custom", {
        types: { Item: Module.type<Type.PrimitiveInteger>() },
        values: {
          Item: Module.value<
            Type.Function<
              readonly [Type.PrimitiveInteger],
              Type.PrimitiveInteger
            >
          >(),
        },
      }),
    );
    const originalKeys = Reflect.ownKeys(custom.types.Item);
    const { program } = Draft.withPrelude(custom);
    const result = program({}, ($) => {
      const { Item } = $.prelude();
      expect(TypeExpression.isExport(Item)).toBe(true);
      expect(Expression.isExpression(Item)).toBe(true);
      expect($.prelude()).not.toHaveProperty("Uuid");
      expect(Result.getOrThrow(TypeExpression.toType(Item))).toStrictEqual(
        Result.getOrThrow(TypeExpression.toType(custom.types.Item)),
      );
      return Item(2n);
    });
    expect(compile(result)).toStrictEqual(call("::custom::Item", literal(2)));
    expect(Reflect.ownKeys(custom.types.Item)).toStrictEqual(originalKeys);
    expect(Object.isFrozen(custom.types)).toBe(true);
  });

  test("generic_value_collision", () => {
    expect.hasAssertions();
    const custom = Result.getOrThrow(
      Module.define("::custom", {
        types: { Both: Module.genericType<Prelude.List>(1) },
        values: {
          Both: Module.value<
            Type.Function<
              readonly [Type.PrimitiveInteger],
              Type.PrimitiveInteger
            >
          >(),
        },
      }),
    );
    const result = Draft.withPrelude(custom).program({}, ($) => {
      const { Both } = $.prelude();
      expect(TypeExpression.isExport(Both)).toBe(true);
      expect(Expression.isExpression(Both)).toBe(true);
      const specialized = Both(Prelude.builtin.types.Integer);
      expect(TypeExpression.isExport(specialized)).toBe(true);
      expect(Result.getOrThrow(TypeExpression.toType(specialized))._tag).toBe(
        "Reference",
      );
      return Both(2n);
    });
    expect(compile(result)).toStrictEqual(call("::custom::Both", literal(2)));
  });

  test("three_namespace_collision", () => {
    expect.hasAssertions();
    const child = Result.getOrThrow(
      Module.define("::custom::child", {
        types: { Integer: Module.type<Type.PrimitiveInteger>() },
      }),
    );
    const generic = Result.getOrThrow(
      Module.define("::custom", {
        types: { Both: Module.genericType<Prelude.List>(1) },
        values: {
          Both: Module.value<Type.GenericFunction<IdentitySignature>>(),
        },
      }),
    );
    const built = Draft.withPrelude({
      ...generic,
      modules: { Both: child },
    }).program({}, ($) => {
      const { Both } = $.prelude();
      expect([
        Module.isModule(Both),
        TypeExpression.isConstructor(Both),
        Expression.isExpression(Both),
      ]).toStrictEqual([true, true, true]);
      expect([Both.types.Integer, $.modules().Both.Integer]).toStrictEqual([
        child.types.Integer,
        child.types.Integer,
      ]);
      const applied = Both(child.types.Integer);
      expect(TypeExpression.isExport(applied)).toBe(true);
      const combinedArgument = Draft.withPrelude(Prelude.builtin).program(
        {},
        (nested) => {
          const result = Both(nested.prelude().Uuid);
          expect([
            TypeExpression.isExport(result),
            Expression.isExpression(result),
          ]).toStrictEqual([true, true]);
          return nested.literal(true);
        },
      );
      expect(Result.isSuccess(combinedArgument)).toBe(true);
      return Both(2n);
    });
    expect(compile(built)).toStrictEqual(call("::custom::Both", literal(2)));
  });

  test("nested_nominal_export", () => {
    expect.hasAssertions();
    const library = Result.getOrThrow(
      Module.define("::custom::library", {
        modules: { entity: Prelude.builtin.modules.entity },
      }),
    );
    const root = Result.getOrThrow(
      Module.define("::custom", { modules: { library } }),
    );
    const result = Draft.withPrelude({
      modules: { root },
      values: { Uuid: Prelude.builtin.values.Uuid },
    }).program({}, ($) => {
      const EntityUuid = $.modules().root.library.entity.EntityUuid;
      expect(TypeExpression.isExport(EntityUuid)).toBe(true);
      expect(Expression.isExpression(EntityUuid)).toBe(true);
      expect(Module.isModule($.modules().root.library.entity)).toBe(true);
      const alias = $.type("Id", EntityUuid);
      expect(Result.isSuccess(TypeExpression.toType(alias))).toBe(true);
      return EntityUuid($.prelude().Uuid("uuid"));
    });
    expect(compile(result)).toStrictEqual(
      call(
        "::kernel::special_form::type",
        "Id",
        "::graph::types::knowledge::entity::EntityUuid",
        call(
          "::graph::types::knowledge::entity::EntityUuid",
          call("::core::uuid::Uuid", literal("uuid")),
        ),
      ),
    );
  });

  test("metadata_projection", () => {
    expect.hasAssertions();
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
    const result = Draft.withPrelude(custom).program({}, ($) => {
      const { Shared } = $.prelude();
      expect(Result.isSuccess(Shared.syntax)).toBe(true);
      expect(Result.isSuccess(TypeExpression.toType(Shared))).toBe(true);
      return Shared.$project("syntax");
    });
    expect(compile(result)).toStrictEqual(
      call("::kernel::special_form::access", "::custom::Shared", "syntax"),
    );
  });

  test("structural_shorthand", () => {
    expect.hasAssertions();
    const identity = Symbol("Tuple");
    const result = Draft.program({}, ($) => {
      const { List, Dict, String: StringType, Integer } = $.prelude();
      $.type("Collections", {
        list: List(BigInt),
        dict: Dict(StringType, Integer),
        nested: List({ value: BigInt }),
        flag: Boolean,
        text: String,
        number: Number,
      });
      const Tuple = $.newtype("Tuple", identity, [BigInt, String]);
      return Tuple([2n, "two"]);
    });
    expect(JSON.stringify(compile(result))).toContain('"#tuple"');
    expect(JSON.stringify(compile(result))).toContain(
      "::kernel::type::List<::kernel::type::Integer>",
    );
  });

  test("construction_failures", () => {
    expect.hasAssertions();
    for (const result of [
      Draft.program({}, ($) => {
        $.let("not a name", 1n);
        return $.literal(true);
      }),
      Draft.program({}, ($) => {
        $.let("bad", Infinity);
        return $.literal(true);
      }),
      Draft.program({}, ($) => {
        $.type("bad", { "not a field": BigInt });
        return $.literal(true);
      }),
      Draft.program({}, ($) =>
        $.if(
          true,
          () => 1n,
          (branch) => {
            branch.let("bad", Number.NaN);
            return 2n;
          },
        ),
      ),
    ]) {
      expect(result._tag).toBe("Failure");
    }

    // @ts-expect-error exercise an unchecked JavaScript caller
    const asynchronous = Draft.program({}, asynchronousBody);
    expect(Result.isFailure(asynchronous)).toBe(true);
  });

  test("invalid_query_and_nominal", () => {
    expect.hasAssertions();
    let visits = 0;
    const query = Fixtures.program({ axis: Fixtures.axis }, ($, inputs) =>
      $.query
        .entities(inputs.axis)
        .filter("not a name", () => {
          visits += 1;
          return true;
        })
        .collect(),
    );
    expect(Result.isFailure(query)).toBe(true);
    expect(visits).toBe(0);
    const identity = Symbol("Bad");
    const value = Draft.program({}, ($) => {
      const Bad = $.newtype("Bad", identity, { number: Number });
      return Bad({ number: Infinity });
    });
    expect(Result.isFailure(value)).toBe(true);
    const declaration = Draft.program({}, ($) => {
      $.newtype("not a name", identity, BigInt);
      return $.literal(true);
    });
    expect(Result.isFailure(declaration)).toBe(true);
  });

  test("external_inputs", () => {
    expect.hasAssertions();
    const external = Expression.input("count", Prelude.builtin.types.Integer);
    const result = Draft.program(
      { count: Prelude.builtin.types.Integer },
      ($) => {
        $.let("unused", external);
        return $.literal(true);
      },
    );
    expect(compile(result)).toStrictEqual(
      call(
        "::kernel::special_form::let",
        "unused",
        call(
          "::kernel::special_form::input",
          "count",
          "::kernel::type::Integer",
        ),
        literal(true),
      ),
    );
  });

  test("escaped_references", () => {
    expect.hasAssertions();
    let escaped: Expression.Expression<Type.PrimitiveInteger, Inputs.Empty> =
      Expression.integer(0);
    Draft.program({}, ($) => {
      escaped = $.let("local", 1n);
      return escaped;
    });
    expect(compile(Draft.program({}, () => escaped))).toBe("local");
  });
});
