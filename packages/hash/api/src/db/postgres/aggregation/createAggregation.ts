import { Connection } from "../types";
import { DBAggregation } from "../../adapter";
import {
  acquireEntityLock,
  getEntityLatestVersion,
  updateVersionedEntity,
} from "../entity";
import { DbEntityNotFoundError } from "../..";
import { insertAggregation } from "./util";
import { requireTransaction } from "../util";

export const createAggregation = async (
  existingConnection: Connection,
  params: {
    createdByAccountId: string;
    sourceAccountId: string;
    sourceEntityId: string;
    path: string;
    operation: object;
  },
): Promise<DBAggregation> =>
  requireTransaction(existingConnection)(async (conn) => {
    const { sourceAccountId, sourceEntityId, createdByAccountId } = params;

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
      dbSourceEntity = await updateVersionedEntity(conn, {
        entity: dbSourceEntity,
        updatedByAccountId: createdByAccountId,
        /** @todo: re-implement method to not require updated `properties` */
        properties: dbSourceEntity.properties,
      });
    }

    const sourceEntityVersionIds: Set<string> = new Set([
      dbSourceEntity.entityVersionId,
    ]);

    const now = new Date();

    const createdAt = now;

    await insertAggregation(conn, {
      aggregation: {
        ...params,
        sourceEntityVersionIds,
        createdAt,
      },
    });

    return { ...params, sourceEntityVersionIds, createdAt };
  });
