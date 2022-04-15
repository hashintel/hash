import { sql } from "slonik";

import { Connection } from "../../types";
import { DbAggregationVersion } from "../../../adapter";
import { mapColumnNamesToSQL } from "../../util";

export const aggregationVersionsColumnNames = [
  "source_account_id",
  "aggregation_version_id",
  "aggregation_id",
  "operation",
  "updated_at",
  "updated_by_account_id",
];

export const aggregationVersionsColumnNamesSQL = mapColumnNamesToSQL(
  aggregationVersionsColumnNames,
);

export type DbAggregationVersionRow = {
  source_account_id: string;
  aggregation_version_id: string;
  aggregation_id: string;
  operation: object;
  updated_at: string;
  updated_by_account_id: string;
};

export const insertAggregationVersionRow = async (
  conn: Connection,
  params: {
    dbAggregationVersion: DbAggregationVersion;
  },
): Promise<void> => {
  const { dbAggregationVersion } = params;

  await conn.query(sql`
    insert into aggregation_versions (${aggregationVersionsColumnNamesSQL})
    values (${sql.join(
      [
        dbAggregationVersion.sourceAccountId,
        dbAggregationVersion.aggregationVersionId,
        dbAggregationVersion.aggregationId,
        JSON.stringify(dbAggregationVersion.operation),
        dbAggregationVersion.updatedAt.toISOString(),
        dbAggregationVersion.updatedByAccountId,
      ],
      sql`, `,
    )})
  `);
};

export const updateAggregationVersionRow = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    aggregationVersionId: string;
    updatedOperation: object;
    updatedAt: Date;
    updatedByAccountId: string;
  },
): Promise<void> => {
  await conn.one(sql`
    update aggregation_versions
    set
      operation = ${JSON.stringify(params.updatedOperation)},
      updated_at = ${params.updatedAt.toISOString()},
      updated_by_account_id = ${params.updatedByAccountId}
    where
      source_account_id = ${params.sourceAccountId}
      and aggregation_version_id = ${params.aggregationVersionId}
    returning aggregation_version_id;
  `);
};
