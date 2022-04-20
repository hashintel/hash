import { Connection } from "../types";
import { acquireEntityLock, getEntityLatestVersion } from "../entity";
import { DbEntityNotFoundError } from "../..";
import {
  deleteAggregationRow,
  removeAggregationFromSource,
} from "./sql/aggregations.util";
import { requireTransaction } from "../util";
import { getAggregation } from "./getAggregation";
import { DbClient } from "../../adapter";
import { DbAggregationNotFoundError } from "../../errors";

/** See {@link DbClient.deleteAggregation} */
export const deleteAggregation = async (
  existingConnection: Connection,
  {
    sourceAccountId,
    aggregationId,
    deletedByAccountId,
  }: Parameters<DbClient["deleteAggregation"]>[0],
): Promise<void> =>
  requireTransaction(existingConnection)(async (conn) => {
    const dbAggregation = await getAggregation(conn, {
      sourceAccountId,
      aggregationId,
    });

    if (!dbAggregation) {
      throw new DbAggregationNotFoundError({ aggregationId });
    }

    const now = new Date();

    const { sourceEntityId } = dbAggregation;

    await acquireEntityLock(conn, { entityId: sourceEntityId });

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
      /**
       * When the source entity is versioned, we have to create a new version
       * of the entity.
       */
      await removeAggregationFromSource(conn, {
        sourceAccountId,
        aggregationId,
        removedFromSourceAt: now,
        removedFromSourceBy: deletedByAccountId,
      });
    } else {
      await deleteAggregationRow(conn, { sourceAccountId, aggregationId });
    }
  });
