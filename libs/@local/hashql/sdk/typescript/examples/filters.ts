/**
 * Existing queries, written with the typed HashQL DSL.
 *
 * Each example pairs its original syntax with a construction using Do and Let. Frontend comparisons cover selection predicates, not subgraph traversal, permissions or UI post-processing. Source paths are relative to the repository root.
 *
 * The declarations describe only the exports and entity fields used here. Expression helpers emit standard-library calls, and filters introduce explicitly named closure parameters. Compilation emits J-Expr without contacting the graph service.
 *
 * @module
 */
import { Result } from "effect";

import { Do as EmptyDo, Import, withPrelude } from "../src/do/index.js";
import { Program, program } from "../src/main.js";
import {
  entity,
  head,
  kernel,
  temporal,
  temporary,
  uuid,
  web,
} from "./filters-declarations.js";

import type { Expression, Type } from "../src/main.js";
import type * as ProgramError from "../src/program/ProgramError.js";

const { Let, Do } = withPrelude({
  values: {
    createUuid: uuid.values.Uuid,
    createEntityUuid: entity.values.EntityUuid,
    ...head.values,
    now: temporary.values.decision_time_now,
  },
});
interface Example {
  readonly title: string;
  readonly source: string;
  readonly before: string;
  readonly root: Result.Result<Expression.Any, ProgramError.Construction>;
  readonly compile: () => Result.Result<string, ProgramError.Construction>;
}
const example = <T extends Type.Any, Inputs>(
  details: Omit<Example, "root" | "compile">,
  root: Result.Result<
    Expression.Expression<T, Inputs>,
    ProgramError.Construction
  >,
): Example => ({
  ...details,
  root,
  compile: () =>
    root.pipe(
      Result.flatMap((expression) => Program.compile(program(expression))),
    ),
});

// Start here: the declarations above replace the generated library bindings still to come.

const allEntities = example(
  {
    title: "1. Start a graph query",
    source:
      "libs/@local/hashql/hir/tests/ui/lower/checking/minimal-graph.jsonc",
    before: `["::graph::tail::collect", ["::graph::head::entities", ["::graph::tmp::decision_time_now"]]]`,
  },
  EmptyDo(
    Import(() => head, ["entities"]),
    Import(() => temporary, { decision_time_now: "now" }),
    ($, { now }) => $.query.entities(now()).collect(),
  ),
);

const entityByUuid = example(
  {
    title: "2. Filter by UUID, then collect",
    source:
      "libs/@local/hashql/hir/tests/ui/lower/checking/collect-filter-graph.jsonc",
    before: `[
  "::graph::tail::collect",
  ["::graph::body::filter",
    ["::graph::head::entities", ["::graph::tmp::decision_time_now"]],
    ["fn", {"#tuple": []}, {"#struct": {"vertex": "_"}}, "_",
      ["==", "vertex.metadata.record_id.entity_id.entity_uuid",
        ["::graph::types::knowledge::entity::EntityUuid",
          ["::core::uuid::Uuid", {"#literal": "e2851dbb-7376-4959-9bca-f72cafc4448f"}]]]]]]`,
  },
  Do(($, { now, createEntityUuid, createUuid }) =>
    $.query
      .entities(now())
      .filter("vertex", (vertex) =>
        vertex.metadata.record_id.entity_id.entity_uuid.$.eq(
          createEntityUuid(
            createUuid($.literal("e2851dbb-7376-4959-9bca-f72cafc4448f")),
          ),
        ),
      )
      .collect(),
  ),
);

const suppliedTimeAxis = example(
  {
    title: "3. Supply the temporal axes as a query input",
    source: "libs/@local/hashql/mir/tests/ui/reify/graph-read.jsonc",
    before: `[
  "::graph::tail::collect",
  ["::graph::body::filter",
    ["::graph::head::entities", ["input", "axis", "_"]],
    ["fn", {"#tuple": []}, {"#struct": {"vertex": "_"}}, "_",
      ["==", "vertex.metadata.record_id.entity_id.entity_uuid",
        ["::graph::types::knowledge::entity::EntityUuid",
          ["::core::uuid::Uuid", {"#literal": "e2851dbb-7376-4959-9bca-f72cafc4448f"}]]]]]]`,
  },
  Do(($, { createEntityUuid, createUuid }) =>
    $.query
      .entities($.input("axis", temporal.types.QueryTemporalAxes))
      .filter("vertex", (vertex) =>
        vertex.metadata.record_id.entity_id.entity_uuid.$.eq(
          createEntityUuid(
            createUuid($.literal("e2851dbb-7376-4959-9bca-f72cafc4448f")),
          ),
        ),
      )
      .collect(),
  ),
);

const predicateLocalBinding = example(
  {
    title: "4. Bind a value inside the predicate",
    source:
      "libs/@local/hashql/hir/tests/ui/lower/graph-hoisting/nested-boolean-expression-outer-let.jsonc",
    before: `[
  "::graph::tail::collect",
  ["::graph::body::filter",
    ["::graph::head::entities", ["::graph::tmp::decision_time_now"]],
    ["fn", {"#tuple": []}, {"#struct": {"vertex": "_"}}, "_",
      ["let", "foo", {"#literal": false},
        ["&&", {"#literal": true}, ["||", {"#literal": true}, "foo"]]]]]]`,
  },
  Do(($, { now }) =>
    $.query
      .entities(now())
      .filter("vertex", () =>
        $.Let("foo", ($) => $.literal(false)).Expr(($, { foo }) =>
          $.literal(true).$.and($.literal(true).$.or(foo)),
        ),
      )
      .collect(),
  ),
);

// Frontend examples translate selection only. Inputs stand in for the original request parameters.

const publishedEntityById = example(
  {
    title: "5. Frontend: look up a published entity",
    source: "apps/hash-frontend/src/components/hooks/use-entity-by-id.ts",
    before: `// The branch where the supplied entity ID has no draft ID.
{
  filter: { all: [
    { equal: [{ path: ["webId"] }, { parameter: webId }] },
    { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] }
  ] },
  includeDrafts: false
}`,
  },
  Do(
    Let("webId", ($) => $.input("web_id", web.types.WebId)),
    Let("entityUuid", ($) => $.input("entity_uuid", entity.types.EntityUuid)),
    ($, { now, webId, entityUuid }) =>
      $.query
        .entities(now())
        .filter("vertex", (vertex) => {
          const id = vertex.metadata.record_id.entity_id;
          return id.web_id.$.eq(webId)
            .$.and(id.entity_uuid.$.eq(entityUuid))
            .$.and(id.draft_id.$.isNone());
        })
        .collect(),
  ),
);

const sidebarSelection = example(
  {
    title: "6. Frontend: the sidebar's web and archive predicates",
    source:
      "apps/hash-frontend/src/shared/generate-sidebar-entities-query-variables.tsx",
    before: `// Predicate excerpt: the separate noisy-system-type exclusion is omitted.
{
  filter: { all: [
    { notEqual: [{ path: ["archived"] }, { parameter: true }] },
    { equal: [{ path: ["webId"] }, { parameter: webId }] }
  ] },
  includeDrafts: false
}`,
  },
  Do(
    Let("webId", ($) => $.input("web_id", web.types.WebId)),
    ($, { now, webId }) =>
      $.query
        .entities(now())
        .filter("vertex", (vertex) =>
          vertex.metadata.record_id.entity_id.web_id.$.eq(webId),
        )
        .filter("vertex", (vertex) =>
          vertex.metadata.archived.$.isFalse().$.and(
            vertex.metadata.record_id.entity_id.draft_id.$.isNone(),
          ),
        )
        .collect(),
  ),
);

const selectedIds = [
  "e2851dbb-7376-4959-9bca-f72cafc4448f",
  "926b2d9b-c099-4cc4-9b0b-906b0c27bc70",
] as const;
const anyOfEntityIds = example(
  {
    title: "7. Frontend: match any supplied entity UUID",
    source: "apps/hash-frontend/src/components/hooks/use-users-with-links.ts",
    before: `// The ID-list predicate only; the user-type filter and avatar traversal are omitted.
{ any: userAccountIds.map((actorId) => ({
  equal: [{ path: ["uuid"] }, { parameter: actorId }]
})) }`,
  },
  Do(($, { now, createEntityUuid, createUuid }) =>
    $.query
      .entities(now())
      .filter("vertex", (vertex) => {
        let matches = $.literal(false);
        for (const entityUuid of selectedIds) {
          matches = matches.$.or(
            vertex.metadata.record_id.entity_id.entity_uuid.$.eq(
              createEntityUuid(createUuid($.literal(entityUuid))),
            ),
          );
        }
        return matches;
      })
      .collect(),
  ),
);

const optionalDrafts = example(
  {
    title: "8. Frontend: make draft inclusion a query-time choice",
    source: "apps/hash-frontend/src/pages/shared/entity-selector.tsx",
    before: `// The request flag only; the selector's later deduplication is omitted.
{ includeDrafts }`,
  },
  Do(
    Let("includeDrafts", ($) =>
      $.input("include_drafts", kernel.types.Boolean, $.literal(false)),
    ),
    ($, { now, includeDrafts }) =>
      $.query
        .entities(now())
        .filter("vertex", (vertex) =>
          $.if(
            includeDrafts,
            () => $.literal(true),
            () => vertex.metadata.record_id.entity_id.draft_id.$.isNone(),
          ),
        )
        .collect(),
  ),
);

/** Before/after examples whose compile methods return the emitted J-Expr. */
export const examples: readonly Example[] = [
  allEntities,
  entityByUuid,
  suppliedTimeAxis,
  predicateLocalBinding,
  publishedEntityById,
  sidebarSelection,
  anyOfEntityIds,
  optionalDrafts,
];
