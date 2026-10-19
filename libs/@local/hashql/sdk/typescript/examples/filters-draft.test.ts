/** Construction and input typing for the Draft filter gallery. @module */
import { Array, Record, Result, Schema, flow, pipe } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import { isReadonlyArray } from "../src/internal/array.js";
import { Expression, JExpr } from "../src/main.js";
import { examples } from "./filters-draft.js";
import { originals } from "./filters-originals.js";

import type { Type } from "../src/main.js";
import type * as ProgramError from "../src/Program/ProgramError.js";
import type {
  Entity,
  EntityUuid,
  TemporalAxes,
  WebId,
} from "./filters-declarations.js";

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

const compile = (
  result: Result.Result<Expression.Any, ProgramError.Construction>,
): string =>
  pipe(
    result,
    Result.flatMap(Expression.toJExpr),
    Result.map(JExpr.compile),
    Result.getOrThrow,
  );

const publishedSelection = 4;
const draftSelection = 7;
const allEntities = examples[0];
const suppliedTimeAxis = examples[2];
const publishedEntityById = examples[publishedSelection];
const optionalDrafts = examples[draftSelection];

const gallery = pipe(
  Array.zip(examples, originals),
  Array.map(([program, { title, source, before }]) => ({
    program,
    title,
    source,
    before,
  })),
);
const jexprExamples = pipe(
  gallery,
  Array.filter(({ source }) => source.endsWith(".jsonc")),
);
const frontendExamples = pipe(
  gallery,
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

describe("draft_filters", () => {
  test("query_with_import", () => {
    expect.hasAssertions();
    expect(examples).toHaveLength(originals.length);
    expect(compile(allEntities)).toBe(
      '["::kernel::special_form::use","::graph::tmp",{"#struct":{"decision_time_now":"now"}},["::graph::tail::collect",["::graph::head::entities",["now"]]]]',
    );
  });

  test.each(gallery)("valid_construction: $title", ({ program }) => {
    expect.hasAssertions();
    expect(() =>
      JExpr.make(
        pipe(program, Result.flatMap(Expression.toJExpr), Result.getOrThrow),
      ),
    ).not.toThrow();
  });

  test.each(jexprExamples)("original_query: $title", ({ program, before }) => {
    expect.hasAssertions();
    expect(normalize(parseJson(compile(program)))).toStrictEqual(
      normalize(parseJson(before)),
    );
  });

  test.each(frontendExamples)("frontend_selection: $title", ({ program }) => {
    expect.hasAssertions();
    expect(parseJson(compile(program))).toMatchSnapshot();
  });

  test("declared_inputs", () => {
    expect.hasAssertions();
    const axis = Result.getOrThrow(suppliedTimeAxis);
    const selected = Result.getOrThrow(publishedEntityById);
    const flag = Result.getOrThrow(optionalDrafts);
    expectTypeOf<Expression.TypeOf<typeof axis>>().toEqualTypeOf<
      Type.List<Entity>
    >();
    expectTypeOf<Expression.Inputs<typeof axis>>().toEqualTypeOf<{
      readonly axis: TemporalAxes;
    }>();
    expectTypeOf<Expression.Inputs<typeof selected>>().toEqualTypeOf<{
      readonly web_id: WebId;
      readonly entity_uuid: EntityUuid;
    }>();
    expectTypeOf<Expression.Inputs<typeof flag>>().toEqualTypeOf<{
      readonly include_drafts: Type.PrimitiveBoolean;
    }>();
    expect(compile(optionalDrafts)).toContain('"include_drafts"');
  });
});
