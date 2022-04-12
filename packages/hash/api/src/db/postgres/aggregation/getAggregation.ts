import { sql } from "slonik";
import { DbAggregation, DbClient } from "../../adapter";

import { Connection } from "../types";
import {
  DbAggregationRow,
  aggregationsColumnNamesSQL,
  mapRowToDbAggregation,
} from "./util";

export const getAggregation = async (
  conn: Connection,
  params: Parameters<DbClient["getAggregation"]>[0],
): Promise<DbAggregation | null> => {
  const row = await conn.maybeOne<DbAggregationRow>(sql`
    select ${aggregationsColumnNamesSQL}
    from aggregations
    where aggregation_id = ${params.aggregationId}
  `);

  return row ? mapRowToDbAggregation(row) : null;
};
