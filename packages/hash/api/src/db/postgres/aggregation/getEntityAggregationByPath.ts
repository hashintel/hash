import { sql } from "slonik";
import { DbAggregation, DbClient } from "../../adapter";

import { Connection } from "../types";
import {
  DbAggregationRow,
  aggregationsColumnNamesSQL,
  mapRowToDbAggregation,
} from "./util";

export const getEntityAggregationByPath = async (
  conn: Connection,
  params: Parameters<DbClient["getEntityAggregationByPath"]>[0],
): Promise<DbAggregation | null> => {
  const row = await conn.maybeOne<DbAggregationRow>(sql`
    select ${aggregationsColumnNamesSQL}
    from aggregations
    where
      ${sql.join(
        [
          sql`source_account_id = ${params.sourceAccountId}`,
          sql`source_entity_id = ${params.sourceEntityId}`,
          params.sourceEntityVersionId !== undefined
            ? sql`${params.sourceEntityVersionId} = ANY(source_entity_version_ids)`
            : [],
          sql`path = ${params.path}`,
        ].flat(),
        sql` and `,
      )}
    order by created_at desc  
    limit 1 -- @todo: remove when aggregation versions are stored in separate table
  `);

  return row ? mapRowToDbAggregation(row) : null;
};
