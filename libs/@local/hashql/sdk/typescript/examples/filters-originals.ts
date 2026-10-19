/**
 * The existing queries that the Draft filter gallery reproduces, in the gallery's order.
 *
 * A J-Expr original comes from a HashQL compiler test, and the gallery's program must match it up to spelling. A frontend original is the selection predicate of a frontend request. It has no J-Expr form, so a snapshot pins the gallery's translation instead. Source paths are relative to the repository root.
 *
 * @module
 */

/** One existing query and where it comes from. */
export interface Original {
  readonly title: string;
  readonly source: string;
  readonly before: string;
}

export const originals: readonly Original[] = [
  {
    title: "1. Start a graph query",
    source:
      "libs/@local/hashql/hir/tests/ui/lower/checking/minimal-graph.jsonc",
    before: `["::graph::tail::collect", ["::graph::head::entities", ["::graph::tmp::decision_time_now"]]]`,
  },
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
  // The gallery's inputs stand in for these requests' parameters.
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
  {
    title: "7. Frontend: match any supplied entity UUID",
    source: "apps/hash-frontend/src/components/hooks/use-users-with-links.ts",
    before: `// The ID-list predicate only; the user-type filter and avatar traversal are omitted.
{ any: userAccountIds.map((actorId) => ({
  equal: [{ path: ["uuid"] }, { parameter: actorId }]
})) }`,
  },
  {
    title: "8. Frontend: make draft inclusion a query-time choice",
    source: "apps/hash-frontend/src/pages/shared/entity-selector.tsx",
    before: `// The request flag only; the selector's later deduplication is omitted.
{ includeDrafts }`,
  },
];
