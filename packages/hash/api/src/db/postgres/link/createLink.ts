import { sql } from "slonik";

import { Connection } from "../types";
import { DBLink } from "../../adapter";
import { acquireEntityLock, getEntityLatestVersion } from "../entity";
import { DbEntityNotFoundError } from "../..";
import { genId } from "../../../util";
import { getIndexedLinks, insertLink } from "./sql/links.util";
import {
  updateLinkVersionIndices,
  insertLinkVersionRow,
} from "./sql/link_versions.util";
import { requireTransaction } from "../util";

export const createLink = async (
  existingConnection: Connection,
  params: {
    createdByAccountId: string;
    path: string;
    index?: number;
    sourceAccountId: string;
    sourceEntityId: string;
    destinationAccountId: string;
    destinationEntityId: string;
    destinationEntityVersionId?: string;
  },
): Promise<DBLink> =>
  requireTransaction(existingConnection)(async (conn) => {
    const promises: Promise<void>[] = [];

    const now = new Date();

    // Defer FKs until end of transaction so we can insert concurrently
    await conn.query(sql`
      set constraints
        incoming_links_source_account_id_link_id_fk
      deferred
    `);

    const { sourceAccountId, sourceEntityId, createdByAccountId } = params;

    const dbLink: DBLink = {
      ...params,
      linkId: genId(),
      linkVersionId: genId(),
      appliedToSourceAt: now,
      appliedToSourceByAccountId: createdByAccountId,
      updatedAt: now,
      updatedByAccountId: createdByAccountId,
    };

    await acquireEntityLock(conn, {
      entityId: sourceEntityId,
    });

    const dbSourceEntity = await getEntityLatestVersion(conn, {
      accountId: sourceAccountId,
      entityId: sourceEntityId,
    });

    if (!dbSourceEntity) {
      throw new DbEntityNotFoundError({
        accountId: sourceAccountId,
        entityId: sourceEntityId,
      });
    }

    const { index, path } = params;

    /** @todo: check index isn't out of bounds */

    /** @todo: when no index is provided, set a default value if other links are indexed */

    if (index !== undefined) {
      /**
       * When the link has an index we have to increment the index of the links that:
       *  - are currently active outgoing links of the source entity
       *  - have the same path
       *  - have an index which is greater than or equal to the index of the new link's index
       */

      if (dbSourceEntity.metadata.versioned) {
        /**
         * When the source entity is versioned, we have have to "re-create" the affected links
         *
         * @todo: when we are storing links and versions of links in separate tables, we no longer
         * have to fully re-create these affected links - only create new versions
         */

        const affectedOutgoingLinks = await getIndexedLinks(conn, {
          sourceAccountId,
          sourceEntityId,
          minimumIndex: index,
          path,
        });

        for (const affectedOutgoingLink of affectedOutgoingLinks) {
          promises.push(
            insertLinkVersionRow(conn, {
              dbLinkVersion: {
                ...affectedOutgoingLink,
                linkVersionId: genId(),
                index: affectedOutgoingLink.index! + 1,
                updatedAt: now,
                updatedByAccountId: createdByAccountId,
              },
            }),
          );
        }
      } else {
        /**
         * When the source entity is not versioned, we can directly update the index of
         * the affected links
         */
        promises.push(
          updateLinkVersionIndices(conn, {
            sourceAccountId,
            sourceEntityId,
            path,
            minimumIndex: index,
            operation: "increment",
            updatedAt: now,
            updatedBy: createdByAccountId,
          }),
        );
      }
    }

    promises.push(insertLink(conn, { dbLink }));

    await Promise.all(promises);

    return dbLink;
  });
