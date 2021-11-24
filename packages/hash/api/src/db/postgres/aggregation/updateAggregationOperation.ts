import { Connection } from "../types";
import {
  acquireEntityLock,
  getEntityLatestVersion,
  updateVersionedEntity,
} from "../entity";
import { DbEntityNotFoundError } from "../..";
import {
  getAggregation,
  insertAggregation,
  updateAggregationRowOperation,
} from "./util";
import { DBAggregation } from "../../adapter";

export const updateAggregationOperation = (
  existingConnection: Connection,
  params: {
    sourceAccountId: string;
    sourceEntityId: string;
    path: string;
    operation: object;
  },
): Promise<DBAggregation> =>
  existingConnection.transaction(async (conn) => {
    const { sourceAccountId, sourceEntityId, operation } = params;

    const now = new Date();

    const {
      createdById,
      createdAt,
      sourceEntityVersionIds: prevSourceEntityVersionIds,
    } = await getAggregation(conn, params);

    let sourceEntityVersionIds: Set<string> = prevSourceEntityVersionIds;

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
        /** @todo: re-implement method to not require updated `properties` */
        properties: dbSourceEntity.properties,
        omittedAggregations: [params],
      });

      sourceEntityVersionIds = new Set([dbSourceEntity.entityVersionId]);

      await insertAggregation(conn, {
        aggregation: {
          ...params,
          sourceEntityVersionIds,
          operation,
          createdAt: now,
          createdById,
        },
      });
    } else {
      await updateAggregationRowOperation(conn, params);
    }

    return {
      ...params,
      sourceEntityVersionIds,
      createdById,
      createdAt,
    };
  });
