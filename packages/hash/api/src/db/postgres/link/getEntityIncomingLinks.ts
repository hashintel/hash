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
  },
) => {
  const rows = await conn.any<DbLinkWithVersionRow>(sql`
    with all_links as (${selectAllLinksWithDestinationEntity({
      destinationAccountId: params.accountId,
      destinationEntityId: params.entityId,
    })})
    select *
    from 
      all_links
      join incoming_links on
          all_links.source_account_id = incoming_links.source_account_id
        and
          all_links.link_id = incoming_links.link_id
  `);

  return rows.map(mapDbRowsToDbLink);
};
