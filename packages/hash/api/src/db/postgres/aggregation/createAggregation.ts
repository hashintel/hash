import { Connection } from "../types";
import { DbAggregation, DbClient } from "../../adapter";
import { acquireEntityLock } from "../entity";
import { insertAggregation } from "./sql/aggregations.util";
import { requireTransaction } from "../util";
import { genId } from "../../../util";

/** See {@link DbClient.createAggregation} */
export const createAggregation = async (
  existingConnection: Connection,
  params: Parameters<DbClient["createAggregation"]>[0],
): Promise<DbAggregation> =>
  requireTransaction(existingConnection)(async (conn) => {
    const { sourceEntityId, createdByAccountId } = params;

    await acquireEntityLock(conn, { entityId: sourceEntityId });

    const now = new Date();

    const dbAggregation: DbAggregation = {
      ...params,
      aggregationId: genId(),
      aggregationVersionId: genId(),
      appliedToSourceAt: now,
      appliedToSourceByAccountId: createdByAccountId,
      updatedAt: now,
      updatedByAccountId: createdByAccountId,
    };

    await insertAggregation(conn, {
      dbAggregation,
    });

    return dbAggregation;
  });
