import { sql } from "slonik";

import { Connection } from "../../types";
import { mapColumnNamesToSQL } from "../../util";

const incomingLinksColumnNames = [
  "destination_account_id",
  "destination_entity_id",
  "source_account_id",
  "link_id",
];

const incomingLinksColumnNamesSQL = mapColumnNamesToSQL(
  incomingLinksColumnNames,
);

export const insertIncomingLinkRow = async (
  conn: Connection,
  params: {
    dbIncomingLink: {
      destinationAccountId: string;
      destinationEntityId: string;
      sourceAccountId: string;
      linkId: string;
    };
  },
): Promise<void> => {
  const { dbIncomingLink } = params;
  await conn.query(sql`
    insert into incoming_links (${incomingLinksColumnNamesSQL})
    values (${sql.join(
      [
        dbIncomingLink.destinationAccountId,
        dbIncomingLink.destinationEntityId,
        dbIncomingLink.sourceAccountId,
        dbIncomingLink.linkId,
      ],
      sql`, `,
    )})
  `);
};
