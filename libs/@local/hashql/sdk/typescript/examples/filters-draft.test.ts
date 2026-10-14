/** Construction and input typing for the Draft filter gallery. @module */
import { Array, Result, pipe } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import { Expression, JExpr } from "../src/main.js";
import { examples } from "./filters-draft.js";
import { examples as originals } from "./filters.js";

import type { Type } from "../src/main.js";
import type * as ProgramError from "../src/program/ProgramError.js";
import type {
  Entity,
  EntityUuid,
  TemporalAxes,
  WebId,
} from "./filters-declarations.js";

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

const comparisons = pipe(
  Array.zip(examples, originals),
  Array.map(([draft, original]) => ({
    draft,
    original,
    title: original.title,
  })),
);

describe("draft_filters", () => {
  test("query_without_imports", () => {
    expect.hasAssertions();
    expect(examples).toHaveLength(originals.length);
    expect(compile(allEntities)).toBe(
      '["::graph::tail::collect",["::graph::head::entities",["::graph::tmp::decision_time_now"]]]',
    );
  });

  test.each(Array.drop(comparisons, 1))(
    "matching_selection: $title",
    ({ draft, original }) => {
      expect.hasAssertions();
      expect(compile(draft)).toBe(Result.getOrThrow(original.compile()));
    },
  );

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
