import { DbAggregation, DbClient } from "../../adapter";

import { Connection } from "../types";
import {
  mapDbRowsToDbAggregation,
  selectAllAggregationsWithSourceEntity,
} from "./sql/aggregations.util";

/** See {@link DbClient.getEntityAggregationByPath} */
export const getEntityAggregationByPath = async (
  conn: Connection,
  params: Parameters<DbClient["getEntityAggregationByPath"]>[0],
): Promise<DbAggregation | null> => {
  const row = await conn.maybeOne(
    selectAllAggregationsWithSourceEntity(params),
  );

  return row ? mapDbRowsToDbAggregation(row) : null;
};
