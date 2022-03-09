import { Connection } from "../types";
import { acquireEntityLock, getEntityLatestVersion } from "../entity";
import { DbEntityNotFoundError, DbLinkNotFoundError } from "../..";
import { genId } from "../../../util";
import { getLink } from "./getLink";
import {
  deleteLinkRow,
  getLinksWithMinimumIndex,
  insertLink,
  removeLinkFromSource,
  updateLinkIndices,
} from "./util";
import { requireTransaction } from "../util";

export const deleteLink = async (
  existingConnection: Connection,
  params: {
    sourceAccountId: string;
    linkId: string;
    deletedByAccountId: string;
  },
): Promise<void> =>
  requireTransaction(existingConnection)(async (conn) => {
    const { sourceAccountId, linkId } = params;

    const dbLink = await getLink(conn, { sourceAccountId, linkId });

    if (!dbLink) {
      throw new DbLinkNotFoundError(params);
    }

    const now = new Date();

    const { sourceEntityId, path, index } = dbLink;

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

    const promises: Promise<void>[] = [];

    if (dbSourceEntity.metadata.versioned) {
      const { deletedByAccountId } = params;

      /**
       * When the source entity is versioned, instead of deleting the link from the
       * datastore we remove the link from the source at the current timestmap (so
       * that the link is preserved in the history)
       */
      promises.push(
        removeLinkFromSource(conn, {
          sourceAccountId,
          linkId,
          removedFromSourceAt: now,
          removedFromSourceBy: deletedByAccountId,
        }),
      );

      if (index !== undefined) {
        /**
         * When the source entity is versioned and the deleted link also has an index,
         * we have to re-create all links which:
         *  - are outgoing links of the previous entity's version
         *  - have the same path
         *  - have an index which is greater than the index of the deleted link's index
         *
         * @todo: when we are storing links and versions of links in separate tables, we no longer
         * have to fully re-create these affected links - only create new versions
         */

        const affectedOutgoingLinks = await getLinksWithMinimumIndex(conn, {
          sourceAccountId,
          sourceEntityId,
          minimumIndex: index + 1,
          path,
        });

        promises.push(
          ...affectedOutgoingLinks
            .map((previousLink) => [
              removeLinkFromSource(conn, {
                ...previousLink,
                removedFromSourceAt: now,
                removedFromSourceBy: deletedByAccountId,
              }),
              insertLink(conn, {
                ...previousLink,
                linkId: genId(),
                index: previousLink.index! - 1,
                appliedToSourceAt: now,
                appliedToSourceBy: deletedByAccountId,
              }),
            ])
            .flat(),
        );
      }
    } else {
      /**
       * When the source entity is not versioned we can remove the link from the
       * datastore entirely
       */

      promises.push(deleteLinkRow(conn, params));

      /**
       * When the source entity is not versioned and the deleted link also has an index,
       * we have to directly increment the index of all the links which:
       *  - are outgoing links of the previous entity's version
       *  - have the same path
       *  - have an index which is greater than the index of the deleted link's index
       */

      if (index !== undefined) {
        promises.push(
          updateLinkIndices(conn, {
            sourceAccountId,
            sourceEntityId,
            path,
            minimumIndex: index + 1,
            operation: "decrement",
          }),
        );
      }
    }

    await Promise.all(promises);
  });
