import { Connection } from "../types";
import {
  acquireEntityLock,
  getEntityLatestVersion,
  updateVersionedEntity,
} from "../entity";
import { DbEntityNotFoundError } from "../..";
import { insertAggregation, updateAggregationRowOperation } from "./util";
import { getAggregation } from "./getAggregation";
import { DbAggregation, DbClient } from "../../adapter";
import { requireTransaction } from "../util";
import { DbAggregationNotFoundError } from "../../errors";
import { genId } from "../../../util";

export const updateAggregationOperation = (
  existingConnection: Connection,
  params: Parameters<DbClient["updateAggregationOperation"]>[0],
): Promise<DbAggregation> =>
  requireTransaction(existingConnection)(async (conn) => {
    const now = new Date();

    const previousDbAggregation = await getAggregation(conn, params);

    if (!previousDbAggregation) {
      throw new DbAggregationNotFoundError(params);
    }

    const { sourceAccountId, sourceEntityId, createdByAccountId, createdAt } =
      previousDbAggregation;

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

    const { operation } = params;

    const updatedDbAggregation = {
      ...previousDbAggregation,
      operation,
      createdByAccountId,
      createdAt,
    };

    if (dbSourceEntity.metadata.versioned) {
      dbSourceEntity = await updateVersionedEntity(conn, {
        updatedByAccountId: createdByAccountId,
        entity: dbSourceEntity,
        /** @todo: re-implement method to not require updated `properties` */
        properties: dbSourceEntity.properties,
        omittedAggregations: [params],
      });

      updatedDbAggregation.aggregationId = genId();
      updatedDbAggregation.sourceEntityVersionIds = new Set([
        dbSourceEntity.entityVersionId,
      ]);
      updatedDbAggregation.createdAt = now;

      await insertAggregation(conn, {
        aggregation: updatedDbAggregation,
      });
    } else {
      await updateAggregationRowOperation(conn, updatedDbAggregation);
    }

    return updatedDbAggregation;
  });
