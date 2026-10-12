import { Result } from "effect";
import { describe, expect, test } from "vitest";

import { Expression, JExpr } from "../src/main.js";
import { examples } from "./filters.js";

const aliases = new Map([
  ["::core::cmp::eq", "=="],
  ["::core::bool::and", "&&"],
  ["::core::bool::or", "||"],
]);

// Only spelling differs: qualified exports, explicit projections and the inferred temporal type.
// oxlint-disable-next-line typescript/no-restricted-types -- JSON enters this comparison without a trusted type
const normalize = (
  value: unknown,
  imports: ReadonlyMap<string, string> = new Map(),
): unknown => {
  if (typeof value === "string") {
    return imports.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    if (value[0] === "::kernel::special_form::use") {
      const [, path, selection, body] = value;
      const imported = new Map(imports);
      if (selection["#tuple"] !== undefined) {
        for (const name of selection["#tuple"]) {
          imported.set(name, `${path}::${name}`);
        }
      } else {
        for (const [name, alias] of Object.entries(selection["#struct"])) {
          if (typeof alias === "string") {
            imported.set(alias === "_" ? name : alias, `${path}::${name}`);
          }
        }
      }
      return normalize(body, imported);
    }
    const nodes = value.map((node) => normalize(node, imports));
    const [operation, input, field] = nodes;
    let callee = operation;
    if (typeof operation === "string") {
      callee = operation.replace("::kernel::special_form::", "");
    }
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
    if (typeof callee === "string" && aliases.has(callee)) {
      return [aliases.get(callee), ...nodes.slice(1)];
    }
    if (operation === callee) {
      return nodes;
    }
    return [callee, ...nodes.slice(1)];
  }
  if (value !== null && typeof value === "object") {
    if ("#literal" in value) {
      return value;
    }
    return Object.fromEntries(
      Object.entries(value).map(([name, member]) => [
        name,
        normalize(member, imports),
      ]),
    );
  }
  return value;
};

const jexprExamples = examples.filter(({ source }) =>
  source.endsWith(".jsonc"),
);
const frontendExamples = examples.filter(
  ({ source }) => source.endsWith(".ts") || source.endsWith(".tsx"),
);

describe("filter_examples", () => {
  test.each(examples)("valid_construction: $title", (example) => {
    expect.hasAssertions();
    expect(Result.isSuccess(example.root)).toBe(true);
    expect(() =>
      JExpr.make(
        Result.getOrThrow(Result.flatMap(example.root, Expression.toJExpr)),
      ),
    ).not.toThrow();
  });

  test.each(jexprExamples)("original_query: $title", (example) => {
    expect.hasAssertions();
    expect(
      normalize(JSON.parse(Result.getOrThrow(example.compile()))),
    ).toStrictEqual(normalize(JSON.parse(example.before)));
  });

  test.each(frontendExamples)("frontend_selection: $title", (example) => {
    expect.hasAssertions();
    expect(JSON.parse(Result.getOrThrow(example.compile()))).toMatchSnapshot();
  });
});
