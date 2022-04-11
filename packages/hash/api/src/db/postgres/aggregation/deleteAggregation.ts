import { Connection } from "../types";
import {
  acquireEntityLock,
  getEntityLatestVersion,
  updateVersionedEntity,
} from "../entity";
import { DbEntityNotFoundError } from "../..";
import { deleteAggregationRow } from "./util";
import { requireTransaction } from "../util";
import { getAggregation } from "./getAggregation";
import { DbClient } from "../../adapter";
import { DbAggregationNotFoundError } from "../../errors";

export const deleteAggregation = async (
  existingConnection: Connection,
  params: Parameters<DbClient["deleteAggregation"]>[0],
): Promise<void> =>
  requireTransaction(existingConnection)(async (conn) => {
    const { aggregationId, deletedByAccountId } = params;

    const dbAggregation = await getAggregation(conn, { aggregationId });

    if (!dbAggregation) {
      throw new DbAggregationNotFoundError(params);
    }

    const { sourceAccountId, sourceEntityId } = dbAggregation;

    await acquireEntityLock(conn, { entityId: sourceEntityId });

    let dbSourceEntity = await getEntityLatestVersion(conn, {
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

      dbSourceEntity = await updateVersionedEntity(conn, {
        updatedByAccountId: deletedByAccountId,
        entity: dbSourceEntity,
        /** @todo: re-implement method to not require updated `properties` */
        properties: dbSourceEntity.properties,
        omittedAggregations: [{ aggregationId }],
      });
    } else {
      await deleteAggregationRow(conn, params);
    }
  });
