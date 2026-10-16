/**
 * Do block construction, declaration ordering and runtime validation tests.
 *
 * @module
 */
// oxlint-disable hash/naming-conventions -- examples preserve HashQL type and constructor names in separate callback arguments
import { Result, pipe } from "effect";
import { assert, describe, expect, test } from "vitest";

import { Expression, Module, Program, program } from "../main.js";
import { Expr } from "../Program/AST/Expr.js";
import { If } from "../Program/AST/If.js";
import { Import as AstImport } from "../Program/AST/Import.js";
import { Let as AstLet } from "../Program/AST/Let.js";
import { Newtype as AstNewtype } from "../Program/AST/Newtype.js";
import { Type as AstType } from "../Program/AST/Type.js";
import { Do as EmptyDo, Import, Let, Newtype, withPrelude } from "./index.js";

import type { Inputs, Type } from "../main.js";

const initialValue = 7;
const fractionalValue = 1.5;
const kernel = Result.getOrThrow(
  Module.define("::kernel::type", {
    types: { Integer: Module.type<Type.PrimitiveInteger>() },
  }),
);
const { Do, Type: Alias } = withPrelude({ modules: { kernel } });
const identity: unique symbol = Symbol("Id");

describe("construction", () => {
  test("sequential_tree", () => {
    expect.hasAssertions();
    const calls: string[] = [];
    const root = EmptyDo(
      Let("value", ($) => {
        calls.push("value");
        return $.integer(initialValue);
      }),
      Let("copy", (_, { value }) => {
        calls.push("copy");
        return value;
      }),
      Let("value", ($) => $.literal("new")),
      (_, { copy }) => {
        calls.push("body");
        return copy;
      },
    );
    const tree = pipe(
      root,
      Result.flatMap(Expression.toNode),
      Result.getOrThrow,
    );
    expect(tree).toBeInstanceOf(AstLet);
    expect(tree.compile()).toStrictEqual([
      "::kernel::special_form::let",
      "value",
      { "#literal": { _tag: "Integer", value: "7" } },
      [
        "::kernel::special_form::let",
        "copy",
        "value",
        ["::kernel::special_form::let", "value", { "#literal": "new" }, "copy"],
      ],
    ]);
    expect(calls).toStrictEqual(["value", "copy", "body"]);
    assert.instanceOf(tree, AstLet);
    expect(tree.child).toBeInstanceOf(AstLet);
  });

  test("type_and_constructor", () => {
    expect.hasAssertions();
    const root = Do(
      Import((_, { kernel }) => kernel),
      Alias("Count", (_, { Integer }) => Integer),
      Newtype("Id", identity, (_, { Count }) => Count),
      Let("id", ($, { Id }) => Id($.integer(initialValue))),
      (_, { id }) => id,
    );
    const imported = pipe(
      root,
      Result.flatMap(Expression.toNode),
      Result.getOrThrow,
    );
    assert.instanceOf<AstImport<typeof imported>>(imported, AstImport);
    const tree = imported.child;
    expect(tree).toBeInstanceOf(AstType);
    expect(tree.compile()).toStrictEqual([
      "::kernel::special_form::type",
      "Count",
      "Integer",
      [
        "::kernel::special_form::newtype",
        "Id",
        "Count",
        [
          "::kernel::special_form::let",
          "id",
          ["Id", { "#literal": { _tag: "Integer", value: "7" } }],
          "id",
        ],
      ],
    ]);
    assert.instanceOf(tree, AstType);
    expect(tree.child).toBeInstanceOf(AstNewtype);
  });
});

describe("block_errors", () => {
  test("missing_body", () => {
    expect.hasAssertions();
    // @ts-expect-error Exercise the runtime boundary without a terminal callback.
    const result = EmptyDo();
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "ProgramConstructionError",
        reason: { _tag: "MissingBlockBody" },
      },
    });
  });

  test("misplaced_body", () => {
    expect.hasAssertions();
    const result = EmptyDo(
      // @ts-expect-error An expression callback cannot precede the terminal callback.
      () => Expression.integer(1),
      ($) => $.integer(2),
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "ProgramConstructionError",
        reason: { _tag: "MisplacedBlockBody" },
      },
    });
  });

  test("invalid_body_result", () => {
    expect.hasAssertions();
    // @ts-expect-error Exercise the runtime boundary with a host value.
    const result = EmptyDo(() => "not an expression");
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "ProgramConstructionError",
        reason: { _tag: "InvalidBodyResult" },
      },
    });
  });

  test("invalid_step", () => {
    expect.hasAssertions();
    const result = EmptyDo(
      // @ts-expect-error A plain object is not a declaration step.
      {},
      ($) => $.integer(2),
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "InvalidBlockStep" } },
    });
  });

  test("binding_reason", () => {
    expect.hasAssertions();
    const result = EmptyDo(
      Let("bad name", ($) => $.integer(1)),
      ($) => $.integer(2),
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "ProgramConstructionError",
        reason: {
          _tag: "InvalidBindingName",
          name: "bad name",
          // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest matchers describe expected values
          cause: expect.any(Object),
        },
      },
    });
  });
});

describe("validation", () => {
  test("declaration_short_circuit", () => {
    expect.hasAssertions();
    const calls: string[] = [];
    const result = EmptyDo(
      Let("bad name", ($) => $.integer(1)),
      Let("later", ($) => {
        calls.push("later");
        return $.integer(2);
      }),
      ($) => {
        calls.push("body");
        return $.integer(initialValue);
      },
    );
    expect(Result.isFailure(result)).toBe(true);
    expect(calls).toStrictEqual([]);
  });

  test("type_names", () => {
    expect.hasAssertions();
    expect(
      Result.isFailure(
        Do(
          Alias("bad name", ($) => $.ref.kernel.types.Integer),
          ($) => $.integer(1),
        ),
      ),
    ).toBe(true);
    expect(
      Result.isFailure(
        Do(
          Newtype("bad name", identity, ($) => $.ref.kernel.types.Integer),
          ($) => $.integer(1),
        ),
      ),
    ).toBe(true);
  });

  test.each([Number.NaN, Infinity, -Infinity, fractionalValue])(
    "invalid_integer: %s",
    (value) => {
      expect.hasAssertions();
      expect(Result.isFailure(EmptyDo(($) => $.integer(value)))).toBe(true);
    },
  );
});

describe("nested_validation", () => {
  test.each([true, false])("branch_failure: %s", (condition) => {
    expect.hasAssertions();
    const calls: string[] = [];
    const result = EmptyDo(($) =>
      $.if(
        $.literal(condition),
        () => {
          calls.push("then");
          return $.Let("bad name", ($) => $.integer(1))
            .Let("skipped", ($) => {
              calls.push("skipped");
              return $.integer(2);
            })
            .Expr(($) => {
              calls.push("body");
              return $.integer(initialValue);
            });
        },
        () => {
          calls.push("else");
          return $.integer(initialValue);
        },
      ),
    );
    expect(Result.isFailure(result)).toBe(true);
    expect(calls).toStrictEqual(["then", "else"]);
  });

  test("alternate_failure", () => {
    expect.hasAssertions();
    const result = EmptyDo(($) =>
      $.if(
        $.literal(true),
        () => $.integer(1),
        () =>
          $.Let("bad name", ($) => $.integer(2)).Expr(
            (_, values) => values["bad name"],
          ),
      ),
    );
    expect(Result.isFailure(result)).toBe(true);
  });

  test("nested_argument_failure", () => {
    expect.hasAssertions();
    const result = EmptyDo(($) => {
      const consume = Expression.fromJExpr<
        Type.Function<readonly [Type.PrimitiveInteger], Type.PrimitiveInteger>,
        Inputs.Empty
      >("consume");
      return consume(
        $.Let("bad name", ($) => $.integer(1)).Expr(
          (_, values) => values["bad name"],
        ),
      );
    });
    expect(Result.isFailure(result)).toBe(true);
  });

  test("input_default_failure", () => {
    expect.hasAssertions();
    const result = Do(($) =>
      $.input("count", $.ref.kernel.types.Integer, $.integer(Number.NaN)),
    );
    expect(Result.isFailure(result)).toBe(true);
  });
});

describe("branches", () => {
  test("implicit_branches", () => {
    expect.hasAssertions();
    const calls: string[] = [];
    const root = Do(
      Import((_, { kernel }) => kernel),
      Let("outer", ($) => $.integer(initialValue)),
      ($, { outer }) =>
        $.if(
          $.literal(false),
          () => {
            calls.push("then");
            return $.Type("Local", (_, { Integer }) => Integer)
              .Let("inner", ($, { outer }, { Local }) =>
                $.input("value", Local, outer),
              )
              .Expr((_, { inner }) => inner);
          },
          () => {
            calls.push("else");
            return outer;
          },
        ),
    );
    const imported = pipe(
      root,
      Result.flatMap(Expression.toNode),
      Result.getOrThrow,
    );
    assert.instanceOf<AstImport<typeof imported>>(imported, AstImport);
    const tree = imported.child;
    expect(tree.compile()).toStrictEqual([
      "::kernel::special_form::let",
      "outer",
      { "#literal": { _tag: "Integer", value: "7" } },
      [
        "::kernel::special_form::if",
        { "#literal": false },
        [
          "::kernel::special_form::type",
          "Local",
          "Integer",
          [
            "::kernel::special_form::let",
            "inner",
            ["::kernel::special_form::input", "value", "Local", "outer"],
            "inner",
          ],
        ],
        "outer",
      ],
    ]);
    tree.compile();
    expect(calls).toStrictEqual(["then", "else"]);
    assert.instanceOf(tree, AstLet);
    expect(tree.child).toBeInstanceOf(If);
  });

  test("nested_conditionals", () => {
    expect.hasAssertions();
    const root = EmptyDo(($) =>
      $.if(
        $.literal(true),
        () =>
          $.Let("local", ($) => $.integer(1)).Expr(($, { local }) =>
            $.if(
              $.literal(false),
              () => local,
              () => $.integer(2),
            ),
          ),
        () => $.literal("other"),
      ),
    );
    expect(
      pipe(root, Result.flatMap(Expression.toJExpr), Result.getOrThrow),
    ).toStrictEqual([
      "::kernel::special_form::if",
      { "#literal": true },
      [
        "::kernel::special_form::let",
        "local",
        { "#literal": { _tag: "Integer", value: "1" } },
        [
          "::kernel::special_form::if",
          { "#literal": false },
          "local",
          { "#literal": { _tag: "Integer", value: "2" } },
        ],
      ],
      { "#literal": "other" },
    ]);
  });
});

describe("expressions", () => {
  test("quoted_binding", () => {
    expect.hasAssertions();
    const root = EmptyDo(
      Let("%", ($) => $.integer(initialValue)),
      (_, values) => values["%"],
    );
    expect(
      pipe(root, Result.flatMap(Expression.toJExpr), Result.getOrThrow),
    ).toStrictEqual([
      "::kernel::special_form::let",
      "`%`",
      { "#literal": { _tag: "Integer", value: "7" } },
      "`%`",
    ]);
    expect(
      Result.isFailure(
        EmptyDo(
          Let("not a name", ($) => $.integer(1)),
          ($) => $.integer(2),
        ),
      ),
    ).toBe(true);
  });

  test("expression_leaf", () => {
    expect.hasAssertions();
    const root = EmptyDo(($) => $.integer(initialValue));
    expect(
      pipe(root, Result.flatMap(Expression.toNode), Result.getOrThrow),
    ).toBeInstanceOf(Expr);
    expect(
      pipe(
        root,
        Result.getOrThrow,
        program,
        Program.compile,
        Result.getOrThrow,
      ),
    ).toBe('{"#literal":7}');
  });
});
