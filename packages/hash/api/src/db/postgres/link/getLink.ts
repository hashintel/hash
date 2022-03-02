import { sql } from "slonik";
import { DBLink } from "../../adapter";

import { Connection } from "../types";
import { selectAllLinks, DBLinkRow, mapDBLinkRowToDBLink } from "./util";

export const getLink = async (
  conn: Connection,
  params: { sourceAccountId: string; linkId: string },
): Promise<DBLink | null> => {
  const row = await conn.maybeOne(sql<DBLinkRow>`
    ${selectAllLinks}
    where
      source_account_id = ${params.sourceAccountId}
      and link_id = ${params.linkId}
  `);

  return row ? mapDBLinkRowToDBLink(row) : null;
};
