/**
 * The filter gallery written with synchronous Draft callbacks.
 *
 * These programs correspond, in order, to filters.ts. Each schema supplies the callback's second argument, and $.let introduces a named HashQL binding. Native loops and functions run during construction. $.if emits a query-time branch.
 *
 * The shared declarations cover only the graph exports used here. Construction emits J-Expr without executing against a graph service.
 *
 * @module
 */
import { Array, pipe } from "effect";

import { withPrelude } from "../src/draft/index.js";
import {
  entity,
  head,
  kernel,
  temporal,
  temporary,
  uuid,
  web,
} from "./filters-declarations.js";

import type { Expression, Inputs, Type } from "../src/main.js";
import type * as ProgramError from "../src/Program/ProgramError.js";
import type {
  Entity,
  EntityUuid,
  TemporalAxes,
  WebId,
} from "./filters-declarations.js";
import type { Result } from "effect";

const { program } = withPrelude({
  values: {
    createUuid: uuid.values.Uuid,
    createEntityUuid: entity.values.EntityUuid,
    ...head.values,
    now: temporary.values.decision_time_now,
  },
});

const allEntities = program({}, ($) => {
  const { now } = $.import(temporary, { decision_time_now: "now" });
  return $.query.entities(now()).collect();
});

const entityByUuid = program({}, ($) => {
  const { now, createEntityUuid, createUuid } = $.prelude();
  return $.query
    .entities(now())
    .filter("vertex", (_, vertex) =>
      $.eq(
        vertex.metadata.record_id.entity_id.entity_uuid,
        createEntityUuid(createUuid("e2851dbb-7376-4959-9bca-f72cafc4448f")),
      ),
    )
    .collect();
});

const suppliedTimeAxis = program(
  { axis: temporal.types.QueryTemporalAxes },
  ($, { axis }) => {
    const { createEntityUuid, createUuid } = $.prelude();

    return $.query
      .entities(axis)
      .filter("vertex", (_, vertex) =>
        $.eq(
          vertex.metadata.record_id.entity_id.entity_uuid,
          createEntityUuid(createUuid("e2851dbb-7376-4959-9bca-f72cafc4448f")),
        ),
      )
      .collect();
  },
);

const predicateLocalBinding = program({}, ($) => {
  const { now } = $.prelude();
  return $.query
    .entities(now())
    .filter("vertex", ($) => {
      const foo = $.let("foo", false);

      return $.and(true, $.or(true, foo));
    })
    .collect();
});

const publishedEntityById = program(
  { web_id: web.types.WebId, entity_uuid: entity.types.EntityUuid },
  ($, inputs) => {
    const { now } = $.prelude();
    const webId = $.let("webId", inputs.web_id);
    const entityUuid = $.let("entityUuid", inputs.entity_uuid);

    return $.query
      .entities(now())
      .filter("vertex", (_, vertex) => {
        const id = vertex.metadata.record_id.entity_id;
        return $.eq(id.web_id, webId)
          .and($.eq(id.entity_uuid, entityUuid))
          .and($.isNone(id.draft_id));
      })
      .collect();
  },
);

const sidebarSelection = program({ web_id: web.types.WebId }, ($, inputs) => {
  const { now } = $.prelude();
  const webId = $.let("webId", inputs.web_id);

  return $.query
    .entities(now())
    .filter("vertex", (_, vertex) =>
      $.eq(vertex.metadata.record_id.entity_id.web_id, webId),
    )
    .filter("vertex", (_, vertex) =>
      $.isFalse(vertex.metadata.archived).and(
        $.isNone(vertex.metadata.record_id.entity_id.draft_id),
      ),
    )
    .collect();
});

const selectedIds = [
  "e2851dbb-7376-4959-9bca-f72cafc4448f",
  "926b2d9b-c099-4cc4-9b0b-906b0c27bc70",
] as const;

const anyOfEntityIds = program({}, ($) => {
  const { now, createEntityUuid, createUuid } = $.prelude();
  return $.query
    .entities(now())
    .filter("vertex", ($, vertex) =>
      pipe(
        selectedIds,
        // oxlint-disable-next-line unicorn/no-array-reduce -- this is Effect's typed fold, not a native array method
        Array.reduce($.literal(false), (matches, entityUuid) =>
          $.or(
            matches,
            $.eq(
              vertex.metadata.record_id.entity_id.entity_uuid,
              createEntityUuid(createUuid(entityUuid)),
            ),
          ),
        ),
      ),
    )
    .collect();
});

// Draft retains the declared input as required, even though the emitted input supplies a default.
const optionalDrafts = program(
  { include_drafts: kernel.types.Boolean },
  ($) => {
    const { now } = $.prelude();
    const includeDrafts = $.let(
      "includeDrafts",
      $.input("include_drafts", kernel.types.Boolean, false),
    );

    return $.query
      .entities(now())
      .filter("vertex", ($, vertex) =>
        $.if(
          includeDrafts,
          () => true,
          () => $.isNone(vertex.metadata.record_id.entity_id.draft_id),
        ),
      )
      .collect();
  },
);

type Query<I> = Result.Result<
  Expression.Expression<Type.List<Entity>, I>,
  ProgramError.Construction
>;

/** The same selections as the Do gallery, retaining each Draft schema in its result type. */
export const examples: readonly [
  allEntities: Query<Inputs.Empty>,
  entityByUuid: Query<Inputs.Empty>,
  suppliedTimeAxis: Query<{ readonly axis: TemporalAxes }>,
  predicateLocalBinding: Query<Inputs.Empty>,
  publishedEntityById: Query<{
    readonly web_id: WebId;
    readonly entity_uuid: EntityUuid;
  }>,
  sidebarSelection: Query<{ readonly web_id: WebId }>,
  anyOfEntityIds: Query<Inputs.Empty>,
  optionalDrafts: Query<{ readonly include_drafts: Type.PrimitiveBoolean }>,
] = [
  allEntities,
  entityByUuid,
  suppliedTimeAxis,
  predicateLocalBinding,
  publishedEntityById,
  sidebarSelection,
  anyOfEntityIds,
  optionalDrafts,
];
