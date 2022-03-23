import { Connection } from "../types";
import { DbClient, DbLink, DbLinkVersion } from "../../adapter";
import { getEntityLatestVersion } from "../entity";
import { DbEntityNotFoundError } from "../..";
import { genId } from "../../../util";
import { getIndexedLinks } from "./sql/links.util";
import { requireTransaction } from "../util";
import { getLink } from "./getLink";
import { DbLinkNotFoundError } from "../../errors";
import {
  insertLinkVersionRow,
  updateLinkVersionRow,
  updateLinkVersionIndices,
} from "./sql/link_versions.util";

export const updateLink = async (
  existingConnection: Connection,
  params: Parameters<DbClient["updateLink"]>[0],
): Promise<DbLink> =>
  requireTransaction(existingConnection)(async (conn) => {
    const { sourceAccountId, linkId, updatedByAccountId } = params;

    const previousDbLink = await getLink(conn, { sourceAccountId, linkId });

    if (!previousDbLink) {
      throw new DbLinkNotFoundError(params);
    }

    const now = new Date();

    const { sourceEntityId, index: previousIndex, path } = previousDbLink;

    if (previousIndex === undefined) {
      throw new Error(
        "Cannot update index of link that previously didn't have an index",
      );
    }

    const { updatedIndex } = params;

    if (previousIndex === updatedIndex) {
      throw new Error(
        "NOOP: Cannot update index of link where previous index has the same value",
      );
    }

    const updatedDbLink: DbLink = { ...previousDbLink, index: updatedIndex };

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

    // Whether the index of the link is being increased
    const isIncreasingIndex = updatedIndex > previousIndex;

    // The maximum index of the affected outgoing links
    const affectedLinksMinimumIndex = isIncreasingIndex
      ? previousIndex + 1
      : updatedIndex;

    // The minimum index of the affected outgoing links
    const affectedLinksMaximumIndex = isIncreasingIndex
      ? updatedIndex
      : previousIndex - 1;

    if (dbSourceEntity.metadata.versioned) {
      const newDbLinkVersion: DbLinkVersion = {
        sourceAccountId,
        linkVersionId: genId(),
        linkId,
        index: updatedIndex,
        updatedAt: now,
        updatedByAccountId,
      };

      updatedDbLink.linkVersionId = newDbLinkVersion.linkVersionId;

      const affectedOutgoingLinks = await getIndexedLinks(conn, {
        sourceAccountId,
        sourceEntityId,
        minimumIndex: affectedLinksMinimumIndex,
        maximumIndex: affectedLinksMaximumIndex,
        path,
      });

      await Promise.all(
        affectedOutgoingLinks.map((affectedOutgoingLink) =>
          insertLinkVersionRow(conn, {
            dbLinkVersion: {
              ...affectedOutgoingLink,
              linkVersionId: genId(),
              index: affectedOutgoingLink.index + (isIncreasingIndex ? -1 : 1),
              updatedAt: now,
              updatedByAccountId,
            },
          }),
        ),
      );

      await insertLinkVersionRow(conn, {
        dbLinkVersion: newDbLinkVersion,
      });
    } else {
      await updateLinkVersionIndices(conn, {
        sourceAccountId,
        sourceEntityId,
        path,
        operation: isIncreasingIndex ? "decrement" : "increment",
        minimumIndex: affectedLinksMinimumIndex,
        maximumIndex: affectedLinksMaximumIndex,
        updatedAt: now,
        updatedByAccountId,
      });

      await updateLinkVersionRow(conn, {
        sourceAccountId,
        linkVersionId: previousDbLink.linkVersionId,
        updatedIndex,
        updatedAt: now,
        updatedByAccountId,
      });
    }

    return updatedDbLink;
  });
