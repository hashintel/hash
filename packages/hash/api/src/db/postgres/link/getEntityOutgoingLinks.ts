import { sql } from "slonik";

import { Connection } from "../types";
import {
  mapDBLinkRowToDBLink,
  selectAllLinksWithSourceEntity,
  DBLinkRow,
} from "./util";

/**
 * Get all outgoing links for a versioned or non-versioned source entity
 * that are "active" (i.e. have not been removed), or were "active" at a
 * particular timestamp.
 * @param params.sourceAccountId the account id of the source entity
 * @param params.sourceEntityId the entityId of the source entity
 * @param params.activeAt the timestamp where the links were "active" (optional)
 * @param params.path the path of the link (optional)
 */
export const getEntityOutgoingLinks = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    activeAt?: Date;
    path?: string;
  },
) => {
  const dbLinkRows = await conn.any(sql<DBLinkRow>`
    ${selectAllLinksWithSourceEntity({
      sourceAccountId: params.accountId,
      sourceEntityId: params.entityId,
      ...params,
    })}
    ${
      params.path !== undefined
        ? /** if a link path was specified, we can order them by their index */
          sql`order by index`
        : sql``
    }
  `);

  return dbLinkRows.map(mapDBLinkRowToDBLink);
};
