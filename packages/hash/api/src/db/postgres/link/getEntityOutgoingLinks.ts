import { sql } from "slonik";

import { Connection } from "../types";
import { mapColumnNamesToSQL } from "../util";
import { DBLinkRow, linksColumnNames, mapDBLinkRowToDBLink } from "./util";

export const getEntityOutgoingLinks = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    entityVersionId?: string;
    path?: string;
  },
) => {
  const rows = await conn.any(sql<DBLinkRow>`
    select ${mapColumnNamesToSQL(linksColumnNames, "links")}
    from links inner join outgoing_links on (
      links.source_account_id = outgoing_links.source_account_id
      and links.link_id = outgoing_links.link_id
    )
    where
    ${sql.join(
      [
        sql`outgoing_links.source_account_id = ${params.accountId}`,
        sql`outgoing_links.source_entity_id = ${params.entityId}`,
        params.entityVersionId !== undefined
          ? sql`${params.entityVersionId} = ANY(links.source_entity_version_ids)`
          : [],
        params.path !== undefined ? sql`path = ${params.path}` : [],
      ].flat(),
      sql` and `,
    )}
    order by index
  `);

  return rows.map(mapDBLinkRowToDBLink);
};
