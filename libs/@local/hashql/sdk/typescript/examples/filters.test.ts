import { Array, Record, Result, Schema, flow, pipe } from "effect";
import { describe, expect, test } from "vitest";

import { isReadonlyArray } from "../src/internal/array.js";
import { Expression, JExpr } from "../src/main.js";
import { examples } from "./filters.js";

const aliases = new Map([
  ["::core::cmp::eq", "=="],
  ["::core::bool::and", "&&"],
  ["::core::bool::or", "||"],
]);

const parseJson = flow(
  Schema.decodeResult(Schema.fromJsonString(Schema.Json)),
  Result.getOrThrow,
);
const parseImport = flow(
  Schema.decodeUnknownResult(
    Schema.Tuple([
      Schema.Literal("::kernel::special_form::use"),
      Schema.String,
      Schema.Union([
        Schema.Struct({ "#tuple": Schema.Array(Schema.String) }),
        Schema.Struct({
          "#struct": Schema.Record(Schema.String, Schema.String),
        }),
      ]),
      Schema.Json,
    ]),
  ),
  Result.getOrThrow,
);

const resolveImport = (
  value: Schema.JsonArray,
  imports: ReadonlyMap<string, string>,
): {
  readonly body: Schema.Json;
  readonly imports: ReadonlyMap<string, string>;
} => {
  const [, path, selection, body] = parseImport(value);
  const imported = new Map(imports);
  if ("#tuple" in selection) {
    for (const name of selection["#tuple"]) {
      imported.set(name, `${path}::${name}`);
    }
  } else {
    for (const [name, alias] of Record.toEntries(selection["#struct"])) {
      let binding = alias;
      if (alias === "_") {
        binding = name;
      }
      imported.set(binding, `${path}::${name}`);
    }
  }
  return { body, imports: imported };
};

// Only spelling differs: qualified exports, explicit projections and the inferred temporal type.
const normalize = (
  value: Schema.Json,
  imports: ReadonlyMap<string, string> = new Map(),
): Schema.Json => {
  if (typeof value === "string") {
    return imports.get(value) ?? value;
  }
  if (isReadonlyArray<Schema.Json, Schema.Json>(value)) {
    if (value[0] === "::kernel::special_form::use") {
      const imported = resolveImport(value, imports);
      return normalize(imported.body, imported.imports);
    }
    const nodes = pipe(
      value,
      Array.map((node) => normalize(node, imports)),
    );
    const [operation, input, field] = nodes;
    if (typeof operation !== "string") {
      return nodes;
    }
    const callee = operation.replace("::kernel::special_form::", "");
    if (
      callee === "access" &&
      typeof input === "string" &&
      typeof field === "string"
    ) {
      return `${input}.${field}`;
    }
    if (
      callee === "input" &&
      input === "axis" &&
      field === "::graph::temporal::QueryTemporalAxes"
    ) {
      return [callee, input, "_"];
    }
    return [aliases.get(callee) ?? callee, ...Array.drop(nodes, 1)];
  }
  if (value !== null && typeof value === "object") {
    if ("#literal" in value) {
      return value;
    }
    return pipe(
      value,
      Record.map((member) => normalize(member, imports)),
    );
  }
  return value;
};

const jexprExamples = pipe(
  examples,
  Array.filter(({ source }) => source.endsWith(".jsonc")),
);
const frontendExamples = pipe(
  examples,
  Array.filter(
    ({ source }) => source.endsWith(".ts") || source.endsWith(".tsx"),
  ),
);

describe("query_normalization", () => {
  test("import_aliases", () => {
    expect.hasAssertions();
    expect(
      normalize([
        "::kernel::special_form::use",
        "::example",
        { "#struct": { left: "binding", right: "_" } },
        ["binding", "right", { "#literal": "binding" }],
      ]),
    ).toStrictEqual([
      "::example::left",
      "::example::right",
      { "#literal": "binding" },
    ]);
  });

  test("import_shadowing", () => {
    expect.hasAssertions();
    expect(
      normalize([
        "::kernel::special_form::use",
        "::outer",
        { "#tuple": ["value"] },
        [
          "pair",
          "value",
          [
            "::kernel::special_form::use",
            "::inner",
            { "#tuple": ["value"] },
            "value",
          ],
          "value",
        ],
      ]),
    ).toStrictEqual([
      "pair",
      "::outer::value",
      "::inner::value",
      "::outer::value",
    ]);
  });

  test("literal_values", () => {
    expect.hasAssertions();
    expect(normalize(["==", "field", { "#literal": false }])).not.toStrictEqual(
      normalize(["==", "field", { "#literal": true }]),
    );
  });
});

describe("filter_examples", () => {
  test.each(examples)("valid_construction: $title", (example) => {
    expect.hasAssertions();
    expect(Result.isSuccess(example.root)).toBe(true);
    expect(() =>
      JExpr.make(
        pipe(
          example.root,
          Result.flatMap(Expression.toJExpr),
          Result.getOrThrow,
        ),
      ),
    ).not.toThrow();
  });

  test.each(jexprExamples)("original_query: $title", (example) => {
    expect.hasAssertions();
    expect(
      normalize(parseJson(Result.getOrThrow(example.compile()))),
    ).toStrictEqual(normalize(parseJson(example.before)));
  });

  test.each(frontendExamples)("frontend_selection: $title", (example) => {
    expect.hasAssertions();
    expect(parseJson(Result.getOrThrow(example.compile()))).toMatchSnapshot();
  });
});
