import { sql } from "slonik";
import { DBLink } from "../../adapter";

import { Connection } from "../types";
import { selectLinks, DBLinkRow, mapDBLinkRowToDBLink } from "./util";

export const getLink = async (
  conn: Connection,
  params: { sourceAccountId: string; linkId: string },
): Promise<DBLink | null> => {
  const row = await conn.maybeOne(sql<DBLinkRow>`
    ${selectLinks}
    where
      source_account_id = ${params.sourceAccountId}
      and link_id = ${params.linkId}
  `);

  return row ? mapDBLinkRowToDBLink(row) : null;
};

export const getLinkInAnyDirection = async (
  conn: Connection,
  params: {
    accountId: string;
    entityIdOne: string;
    entityIdTwo: string;
  },
): Promise<DBLink | null> => {
  const row = await conn.maybeOne(sql<DBLinkRow>`
    ${selectLinks}
    where
      source_account_id = ${params.accountId} and destination_account_id = ${params.accountId}
      and 
        ((source_entity_id = ${params.entityIdOne} and destination_entity_id = ${params.entityIdTwo})
      or (destination_entity_id = ${params.entityIdOne} and source_entity_id = ${params.entityIdTwo} ))
  `);

  return row ? mapDBLinkRowToDBLink(row) : null;
};
