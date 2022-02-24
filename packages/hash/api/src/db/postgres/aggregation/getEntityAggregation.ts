import { sql } from "slonik";
import { DBAggregation } from "../../adapter";

import { Connection } from "../types";
import {
  DBAggregationRow,
  aggregationsColumnNamesSQL,
  mapRowToDBAggregation,
} from "./util";

export const getEntityAggregation = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    sourceEntityId: string;
    sourceEntityVersionId?: string;
    path: string;
  },
): Promise<DBAggregation | null> => {
  const row = await conn.maybeOne(sql<DBAggregationRow>`
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
    limit 1
  `);

  return row ? mapRowToDBAggregation(row) : null;
};
