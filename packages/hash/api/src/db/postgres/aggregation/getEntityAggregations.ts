import { DbAggregation, DbClient } from "../../adapter";

import { Connection } from "../types";
import {
  mapDbRowsToDbAggregation,
  selectAllAggregationsWithSourceEntity,
} from "./sql/aggregations.util";

/** See {@link DbClient.getEntityAggregations} */
export const getEntityAggregations = async (
  conn: Connection,
  params: Parameters<DbClient["getEntityAggregations"]>[0],
): Promise<DbAggregation[]> => {
  const rows = await conn.any(selectAllAggregationsWithSourceEntity(params));

  return rows.map(mapDbRowsToDbAggregation);
};
