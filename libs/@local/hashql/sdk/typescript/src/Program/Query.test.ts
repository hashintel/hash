// oxlint-disable unicorn/no-array-method-this-argument -- Result.map and Result.flatMap are not array methods
import { Result } from "effect";
import { describe, expect, test } from "vitest";

import { Do as EmptyDo, withPrelude } from "../do/index.js";
import { Expression } from "../main.js";
import * as Operators from "./Operators.js";

import type { Inputs, Type } from "../main.js";

type Vertex = Type.Struct<{ readonly enabled: Type.PrimitiveBoolean }>;
type Graph = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": Vertex }>
>;
const { Do } = withPrelude({
  values: {
    entities: Expression.fromJExpr<
      Type.Function<readonly [], Graph>,
      Inputs.Empty
    >("entities"),
  },
});

describe("query", () => {
  test("named_filter", () => {
    expect.hasAssertions();
    let calls = 0;
    const result = Do(($) =>
      $.query
        .entities()
        .filter("item", (item) => {
          calls += 1;
          return Operators.isFalse(item.enabled);
        })
        .collect(),
    );
    const syntax = Result.getOrThrow(
      Result.flatMap(result, Expression.toJExpr),
    );
    expect(syntax).toStrictEqual([
      "::graph::tail::collect",
      [
        "::graph::body::filter",
        ["entities"],
        [
          "fn",
          { "#tuple": [] },
          { "#struct": { item: "_" } },
          "_",
          [
            "::core::cmp::eq",
            ["::kernel::special_form::access", "item", "enabled"],
            { "#literal": false },
          ],
        ],
      ],
    ]);
    expect(calls).toBe(1);
  });

  test("invalid_parameter", () => {
    expect.hasAssertions();
    let called = false;
    const result = Do(($) =>
      $.query.entities().filter("bad name", () => {
        called = true;
        return $.literal(true);
      }),
    );
    expect(Result.isFailure(result)).toBe(true);
    expect(called).toBe(false);
  });

  test("predicate_failure", () => {
    expect.hasAssertions();
    const result = Do(($) =>
      $.query
        .entities()
        .filter("item", () =>
          $.Let("bad name", ($) => $.literal(true)).Expr(
            (_, values) => values["bad name"],
          ),
        )
        .collect(),
    );
    expect(Result.isFailure(result)).toBe(true);
  });

  test("reserved_projection", () => {
    expect.hasAssertions();
    const record = Expression.fromJExpr<
      Type.Struct<{ readonly $: Type.PrimitiveBoolean }>,
      Inputs.Empty
    >("record");
    const result = EmptyDo(() => Operators.isTrue(record.$project("$")));
    expect(
      Result.getOrThrow(Result.flatMap(result, Expression.toJExpr)),
    ).toStrictEqual([
      "::core::cmp::eq",
      ["::kernel::special_form::access", "record", "$"],
      { "#literal": true },
    ]);
  });
});
