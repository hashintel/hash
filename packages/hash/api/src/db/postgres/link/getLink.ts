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

export const getLinkByEntityIds = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    sourceEntityId: string;
    destinationEntityId: string;
  },
): Promise<DBLink | null> => {
  const row = await conn.maybeOne(sql<DBLinkRow>`
    ${selectLinks}
    where
      source_account_id = ${params.sourceAccountId}
      and source_entity_id = ${params.sourceEntityId}
      and destination_entity_id = ${params.destinationEntityId}
  `);

  return row ? mapDBLinkRowToDBLink(row) : null;
};
