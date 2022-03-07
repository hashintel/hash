import { Connection } from "../types";
import {
  acquireEntityLock,
  getEntityLatestVersion,
  updateVersionedEntity,
} from "../entity";
import { DbEntityNotFoundError } from "../..";
import { insertAggregation, updateAggregationRowOperation } from "./util";
import { getEntityAggregation } from "./getEntityAggregation";
import { DBAggregation } from "../../adapter";
import { requireTransaction } from "../util";
import { DbAggregationNotFoundError } from "../../errors";

export const updateAggregationOperation = (
  existingConnection: Connection,
  params: {
    sourceAccountId: string;
    sourceEntityId: string;
    path: string;
    operation: object;
  },
): Promise<DBAggregation> =>
  requireTransaction(existingConnection)(async (conn) => {
    const { sourceAccountId, sourceEntityId, operation } = params;

    const now = new Date();

    const dbAggregation = await getEntityAggregation(conn, params);

    if (!dbAggregation) {
      throw new DbAggregationNotFoundError(params);
    }

    const {
      createdByAccountId,
      createdAt,
      sourceEntityVersionIds: prevSourceEntityVersionIds,
    } = dbAggregation;

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
        updatedByAccountId: createdByAccountId,
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
          createdByAccountId,
        },
      });
    } else {
      await updateAggregationRowOperation(conn, params);
    }

    return {
      ...params,
      sourceEntityVersionIds,
      createdByAccountId,
      createdAt,
    };
  });
