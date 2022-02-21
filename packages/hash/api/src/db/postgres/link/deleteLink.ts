import { Connection } from "../types";
import {
  acquireEntityLock,
  getEntityLatestVersion,
  updateVersionedEntity,
} from "../entity";
import { DbEntityNotFoundError, DbLinkNotFoundError } from "../..";
import { genId } from "../../../util";
import { getLink } from "./getLink";
import {
  deleteLinkRow,
  getLinksWithMinimumIndex,
  insertLink,
  updateLinkIndices,
} from "./util";
import { transaction } from "../util";

export const deleteLink = async (
  existingConnection: Connection,
  params: {
    sourceAccountId: string;
    linkId: string;
    deletedByAccountId: string;
  },
): Promise<void> =>
  transaction(existingConnection)(async (conn) => {
    const dbLink = await getLink(conn, params);

    if (!dbLink) {
      throw new DbLinkNotFoundError(params);
    }

    const { sourceAccountId, sourceEntityId, path, index } = dbLink;

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
       *
       * Note when the deleted link also has an index, we have to re-create all
       * links whose index has to be decremented, which are the links that:
       *  - are outgoing links of the previous entity's version
       *  - have the same path
       *  - have an index which is greater than the index of the deleted link's index
       */

      const affectedOutgoingLinks =
        index !== undefined
          ? await getLinksWithMinimumIndex(conn, {
              sourceAccountId,
              sourceEntityId,
              sourceEntityVersionId: dbSourceEntity.entityVersionId,
              minimumIndex: index + 1,
              path,
            })
          : [];

      const { deletedByAccountId } = params;

      dbSourceEntity = await updateVersionedEntity(conn, {
        entity: dbSourceEntity,
        /** @todo: re-implement method to not require updated `properties` */
        properties: dbSourceEntity.properties,
        updatedByAccountId: deletedByAccountId,
        omittedOutgoingLinks: [
          ...affectedOutgoingLinks,
          { sourceAccountId, linkId: params.linkId },
        ],
      });

      if (index !== undefined) {
        /** @todo: implement insertLinks and use that instead of many insertLink queries */
        const now = new Date();

        await Promise.all(
          affectedOutgoingLinks
            .map((previousLink) => {
              const linkId = genId();
              return insertLink(conn, {
                ...previousLink,
                linkId,
                index: previousLink.index! - 1,
                sourceEntityVersionIds: new Set([
                  dbSourceEntity.entityVersionId,
                ]),
                createdAt: now,
              });
            })
            .flat(),
        );
      }
    } else {
      await Promise.all(
        [
          index !== undefined
            ? updateLinkIndices(conn, {
                sourceAccountId,
                sourceEntityId,
                path,
                minimumIndex: index + 1,
                operation: "decrement",
              })
            : [],
          deleteLinkRow(conn, params),
        ].flat(),
      );
    }
  });
