import { Connection } from "../types";
import { DbAggregation, DbClient } from "../../adapter";
import {
  acquireEntityLock,
  getEntityLatestVersion,
  updateVersionedEntity,
} from "../entity";
import { DbEntityNotFoundError } from "../..";
import { insertAggregation } from "./util";
import { requireTransaction } from "../util";
import { genId } from "../../../util";

export const createAggregation = async (
  existingConnection: Connection,
  params: Parameters<DbClient["createAggregation"]>[0],
): Promise<DbAggregation> =>
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

    const aggregation: DbAggregation = {
      ...params,
      aggregationId: genId(),
      sourceEntityVersionIds,
      createdAt: now,
    };

    await insertAggregation(conn, {
      aggregation,
    });

    return aggregation;
  });
