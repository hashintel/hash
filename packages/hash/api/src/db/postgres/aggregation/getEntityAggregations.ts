import { sql } from "slonik";
import { DBAggregation } from "../../adapter";

import { Connection } from "../types";
import {
  DBAggregationRow,
  aggregationsColumnNamesSQL,
  mapRowToDBAggregation,
} from "./util";

export const getEntityAggregations = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    sourceEntityId: string;
    sourceEntityVersionId?: string;
  },
): Promise<DBAggregation[]> => {
  const rows = await conn.any<DBAggregationRow>(sql`
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

  return rows.map(mapRowToDBAggregation);
};
