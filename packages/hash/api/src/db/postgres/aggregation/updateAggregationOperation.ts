import { Connection } from "../types";
import { acquireEntityLock, getEntityLatestVersion } from "../entity";
import { DbEntityNotFoundError } from "../..";
import { getAggregation } from "./getAggregation";
import { DbAggregation, DbClient } from "../../adapter";
import { requireTransaction } from "../util";
import { DbAggregationNotFoundError } from "../../errors";
import { genId } from "../../../util";
import {
  insertAggregationVersionRow,
  updateAggregationVersionRow,
} from "./sql/aggregation_versions.util";

/** See {@link DbClient.updateAggregationOperation} */
export const updateAggregationOperation = (
  existingConnection: Connection,
  {
    sourceAccountId,
    aggregationId,
    updatedOperation,
    updatedByAccountId,
  }: Parameters<DbClient["updateAggregationOperation"]>[0],
): Promise<DbAggregation> =>
  requireTransaction(existingConnection)(async (conn) => {
    const now = new Date();

    const previousDbAggregation = await getAggregation(conn, {
      sourceAccountId,
      aggregationId,
    });

    if (!previousDbAggregation) {
      throw new DbAggregationNotFoundError({ aggregationId });
    }

    const { sourceEntityId } = previousDbAggregation;

    await acquireEntityLock(conn, { entityId: sourceEntityId });

    const updatedDbAggregation = {
      ...previousDbAggregation,
      operation: updatedOperation,
      updatedAt: now,
      updatedByAccountId,
    };

    const dbSourceEntity = await getEntityLatestVersion(conn, {
      accountId: sourceAccountId,
      entityId: sourceEntityId,
    }).then((dbEntity) => {
      if (!dbEntity) {
        throw new DbEntityNotFoundError({
          accountId: sourceAccountId,
          entityId: sourceEntityId,
        });
      }
      return dbEntity;
    });

    if (dbSourceEntity.metadata.versioned) {
      updatedDbAggregation.aggregationVersionId = genId();

      await insertAggregationVersionRow(conn, {
        dbAggregationVersion: updatedDbAggregation,
      });
    } else {
      await updateAggregationVersionRow(conn, {
        ...updatedDbAggregation,
        updatedOperation,
      });
    }

    return updatedDbAggregation;
  });
