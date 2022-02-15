import { sql } from "slonik";

import { Connection } from "../types";
import { DBLinkRow, linksColumnNames, mapDBLinkRowToDBLink } from "./util";
import { mapColumnNamesToSQL } from "../util";

export const getEntityIncomingLinks = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    entityVersionId?: string;
  },
) => {
  const rows = await conn.any(sql<DBLinkRow>`
    select ${mapColumnNamesToSQL(linksColumnNames, "links")}
    from links inner join incoming_links on (
      links.source_account_id = incoming_links.source_account_id
      and links.link_id = incoming_links.link_id
    )
    where
    ${sql.join(
      [
        sql`incoming_links.destination_account_id = ${params.accountId}`,
        sql`incoming_links.destination_entity_id = ${params.entityId}`,
        params.entityVersionId !== undefined
          ? sql`links.destination_entity_version_id = ${params.entityVersionId}`
          : [],
      ].flat(),
      sql` and `,
    )}
    order by index
  `);

  return rows.map(mapDBLinkRowToDBLink);
};
