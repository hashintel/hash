import { sql, ValueExpressionType } from "slonik";

import { Connection } from "../../types";
import { DbAggregation } from "../../../adapter";
import { mapColumnNamesToSQL } from "../../util";
import {
  aggregationVersionsColumnNames,
  DbAggregationVersionRow,
  insertAggregationVersionRow,
} from "./aggregation_versions.util";

export const aggregationsColumnNames = [
  "aggregation_id",
  "path",
  "source_account_id",
  "source_entity_id",
  "applied_to_source_at",
  "applied_to_source_by_account_id",
  "removed_from_source_at",
  "removed_from_source_by_account_id",
];

export const aggregationsColumnNamesSQL = mapColumnNamesToSQL(
  aggregationsColumnNames,
);

export type DbAggregationRow = {
  aggregation_id: string;
  source_account_id: string;
  source_entity_id: string;
  path: string;
  applied_to_source_at: string;
  applied_to_source_by_account_id: string;
  removed_from_source_at: string | null;
  removed_from_source_by_account_id: string | null;
};

type DbAggregationWithVersionRow = DbAggregationRow & DbAggregationVersionRow;

/** selects all aggregation versions in the datastore */
const selectAllAggregationVersions = sql<DbAggregationWithVersionRow>`
  select
    ${mapColumnNamesToSQL(aggregationsColumnNames, "aggregations")},
    ${mapColumnNamesToSQL(
      aggregationVersionsColumnNames.filter(
        (column) => !aggregationsColumnNames.includes(column),
      ),
      "aggregation_versions",
    )}
  from
    aggregations
    join aggregation_versions
    on aggregations.aggregation_id = aggregation_versions.aggregation_id
`;

/** selects all aggregations in the datastore with their latest version */
const selectAllLatestVersionsOfAggregations = sql<DbAggregationWithVersionRow>`
  select distinct on (aggregation_id) *
  from (${selectAllAggregationVersions}) as all_aggregation_versions
  order by aggregation_id, updated_at desc
`;

/** select all aggregations with the latest version before a given timestamp */
const selectAllLatestVersionsOfAggregationsBeforeTimestamp = (params: {
  beforeTimestamp: Date;
}) =>
  sql<DbAggregationWithVersionRow>`
    select distinct on (aggregation_id) *
    from (
      ${selectAllAggregationVersions}
      where aggregation_versions.updated_at <= ${params.beforeTimestamp.toISOString()}
    ) as all_aggregation_versions
    order by aggregation_id, updated_at desc
`;

/** selects all versions of a specifc aggregation */
const selectAllVersionsOfAggregation = (params: {
  sourceAccountId: string;
  aggregationId: string;
}) => sql<DbAggregationWithVersionRow>`
  with all_aggregations as (${selectAllAggregationVersions})
  select *
  from all_aggregations
  where
    source_account_id = ${params.sourceAccountId} and aggregation_id = ${params.aggregationId}
`;

/** selects the latest version of a specific aggregation */
export const selectLatestVersionOfAggregation = (params: {
  sourceAccountId: string;
  aggregationId: string;
}) => sql<DbAggregationWithVersionRow>`
  with all_aggregation_versions as (${selectAllVersionsOfAggregation(params)})
  select distinct on (aggregation_id) *
  from all_aggregation_versions
  order by aggregation_id, updated_at desc
`;

export const selectAllAggregationsWithSourceEntity = (params: {
  sourceAccountId: string;
  sourceEntityId: string;
  activeAt?: Date;
  path?: string;
  additionalClauses?: ValueExpressionType[];
}) => sql<DbAggregationWithVersionRow>`
 with all_aggregations as (${
   params.activeAt
     ? selectAllLatestVersionsOfAggregationsBeforeTimestamp({
         beforeTimestamp: params.activeAt,
       })
     : selectAllLatestVersionsOfAggregations
 })
  select *
  from all_aggregations
  where
    ${sql.join(
      [
        sql`source_account_id = ${params.sourceAccountId}`,
        sql`source_entity_id = ${params.sourceEntityId}`,
        params.activeAt
          ? [
              // the aggregation was applied before the timestamp
              sql`applied_to_source_at <= ${params.activeAt.toISOString()}`,
              // either the aggregation was removed after the timestamp, or the aggregation hasn't been removed yet
              sql`(
                  removed_from_source_at >= ${params.activeAt.toISOString()}
                or
                  removed_from_source_at is null 
              )`,
            ]
          : [
              // the aggregation hasn't been removed yet (so can be considered as "active" right now)
              sql`removed_from_source_at is null`,
            ],
        params.path !== undefined ? sql`path = ${params.path}` : [],
        ...(params.additionalClauses ?? []),
      ].flat(),
      sql` and `,
    )}
`;

/**
 * Inserts a new aggregation into the `aggregations` table
 * lookup table.
 */
export const insertAggregation = async (
  conn: Connection,
  params: {
    dbAggregation: DbAggregation;
  },
): Promise<void> => {
  const { dbAggregation } = params;

  await Promise.all([
    conn.query(sql`
      insert into aggregations (${aggregationsColumnNamesSQL})
      values (${sql.join(
        [
          dbAggregation.aggregationId,
          dbAggregation.path,
          dbAggregation.sourceAccountId,
          dbAggregation.sourceEntityId,
          dbAggregation.appliedToSourceAt.toISOString(),
          dbAggregation.appliedToSourceByAccountId,
          null,
          null,
        ],
        sql`, `,
      )})
    `),
    insertAggregationVersionRow(conn, {
      dbAggregationVersion: dbAggregation,
    }),
  ]);
};

export const mapDbRowsToDbAggregation = (
  dbAggregationWithVersionRow: DbAggregationWithVersionRow,
): DbAggregation => ({
  aggregationId: dbAggregationWithVersionRow.aggregation_id,
  aggregationVersionId: dbAggregationWithVersionRow.aggregation_version_id,
  sourceAccountId: dbAggregationWithVersionRow.source_account_id,
  sourceEntityId: dbAggregationWithVersionRow.source_entity_id,
  appliedToSourceAt: new Date(dbAggregationWithVersionRow.applied_to_source_at),
  appliedToSourceByAccountId:
    dbAggregationWithVersionRow.applied_to_source_by_account_id,
  removedFromSourceAt: dbAggregationWithVersionRow.removed_from_source_at
    ? new Date(dbAggregationWithVersionRow.removed_from_source_at)
    : undefined,
  removedFromSourceByAccountId:
    dbAggregationWithVersionRow.removed_from_source_by_account_id ?? undefined,
  path: dbAggregationWithVersionRow.path,
  operation: dbAggregationWithVersionRow.operation,
  updatedAt: new Date(dbAggregationWithVersionRow.updated_at),
  updatedByAccountId: dbAggregationWithVersionRow.updated_by_account_id,
});

export const removeAggregationFromSource = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    aggregationId: string;
    removedFromSourceAt: Date;
    removedFromSourceBy: string;
  },
): Promise<void> => {
  await conn.query(sql`
    update aggregations
    set
      removed_from_source_at = ${params.removedFromSourceAt.toISOString()},
      removed_from_source_by_account_id = ${params.removedFromSourceBy}
    where (
      source_account_id = ${params.sourceAccountId}
      and aggregation_id = ${params.aggregationId}
    );
  `);
};

/**
 * Delete an aggregation from the aggregations table
 */
export const deleteAggregationRow = async (
  conn: Connection,
  params: { sourceAccountId: string; aggregationId: string },
): Promise<void> => {
  await conn.one(sql`
    delete from aggregations
    where
        source_account_id = ${params.sourceAccountId}
      and
        aggregation_id = ${params.aggregationId}
    returning aggregation_id;
  `);
};
