import { Connection } from "../types";
import {
  acquireEntityLock,
  getEntityLatestVersion,
  updateVersionedEntity,
} from "../entity";
import { DbEntityNotFoundError } from "../..";
import { deleteAggregationRow } from "./util";
import { transaction } from "../util";

export const deleteAggregation = async (
  existingConnection: Connection,
  params: {
    sourceAccountId: string;
    sourceEntityId: string;
    path: string;
    deletedByAccountId: string;
  },
): Promise<void> =>
  transaction(existingConnection)(async (conn) => {
    const { sourceAccountId, sourceEntityId, deletedByAccountId } = params;

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
        omittedAggregations: [params],
      });
    } else {
      await deleteAggregationRow(conn, params);
    }
  });
