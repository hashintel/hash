import { sql } from "slonik";
import { DbAggregation } from "../../adapter";

import { Connection } from "../types";
import {
  DbAggregationRow,
  aggregationsColumnNamesSQL,
  mapRowToDbAggregation,
} from "./util";

export const getEntityAggregations = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    sourceEntityId: string;
    sourceEntityVersionId?: string;
  },
): Promise<DbAggregation[]> => {
  const rows = await conn.any<DbAggregationRow>(sql`
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
        ].flat(),
        sql` and `,
      )}
  `);

  return rows.map(mapRowToDbAggregation);
};
