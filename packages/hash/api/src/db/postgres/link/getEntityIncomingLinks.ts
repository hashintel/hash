import { sql } from "slonik";

import { Connection } from "../types";
import {
  mapDbRowsToDbLink,
  DbLinkWithVersionRow,
  selectAllLinksWithDestinationEntity,
} from "./sql/links.util";

export const getEntityIncomingLinks = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    activeAt?: Date;
    path?: string;
  },
) => {
  const dbLinkRows = await conn.any<DbLinkWithVersionRow>(sql`
  ${selectAllLinksWithDestinationEntity({
    destinationAccountId: params.accountId,
    destinationEntityId: params.entityId,
    ...params,
  })}
  ${
    params.path !== undefined
      ? /** if a link path was specified, we can order them by their index */
        sql`order by index`
      : sql``
  }
`);

  return dbLinkRows.map(mapDbRowsToDbLink);
};
