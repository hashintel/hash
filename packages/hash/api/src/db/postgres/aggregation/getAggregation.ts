import { DbAggregation, DbClient } from "../../adapter";

import { Connection } from "../types";
import {
  mapDbRowsToDbAggregation,
  selectLatestVersionOfAggregation,
} from "./sql/aggregations.util";

/** See {@link DbClient.getAggregation} */
export const getAggregation = async (
  conn: Connection,
  params: Parameters<DbClient["getAggregation"]>[0],
): Promise<DbAggregation | null> => {
  const row = await conn.maybeOne(selectLatestVersionOfAggregation(params));

  return row ? mapDbRowsToDbAggregation(row) : null;
};
