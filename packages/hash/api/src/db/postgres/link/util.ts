import { sql } from "slonik";

import { Connection } from "../types";
import { DBLink } from "../../adapter";
import { mapColumnNamesToSQL } from "../util";

const incomingLinksColumnNames = [
  "destination_account_id",
  "destination_entity_id",
  "source_account_id",
  "link_id",
];

const incomingLinksColumnNamesSQL = mapColumnNamesToSQL(
  incomingLinksColumnNames,
);

export const insertIncomingLink = async (
  conn: Connection,
  params: {
    destinationAccountId: string;
    destinationEntityId: string;
    sourceAccountId: string;
    linkId: string;
  },
): Promise<void> => {
  await conn.query(sql`
    insert into incoming_links (${incomingLinksColumnNamesSQL})
    values (${sql.join(
      [
        params.destinationAccountId,
        params.destinationEntityId,
        params.sourceAccountId,
        params.linkId,
      ],
      sql`, `,
    )})
  `);
};

export const linksColumnNames = [
  "link_id",
  "path",
  "index",
  "source_account_id",
  "source_entity_id",
  "source_entity_version_ids",
  "destination_account_id",
  "destination_entity_id",
  "destination_entity_version_id",
  "created_at",
];

export const linksColumnNamesSQL = mapColumnNamesToSQL(linksColumnNames);

export type DBLinkRow = {
  link_id: string;
  path: string;
  index: number | null;
  source_account_id: string;
  source_entity_id: string;
  source_entity_version_ids: string[];
  destination_account_id: string;
  destination_entity_id: string;
  destination_entity_version_id: string | null;
  created_at: string;
};

export const mapDBLinkRowToDBLink = (row: DBLinkRow): DBLink => ({
  linkId: row.link_id,
  path: row.path,
  index: row.index === null ? undefined : row.index,
  sourceAccountId: row.source_account_id,
  sourceEntityId: row.source_entity_id,
  sourceEntityVersionIds: new Set(row.source_entity_version_ids),
  destinationAccountId: row.destination_account_id,
  destinationEntityId: row.destination_entity_id,
  destinationEntityVersionId: row.destination_entity_version_id || undefined,
  createdAt: new Date(row.created_at),
});

export const selectLinks = sql<DBLinkRow>`
  select ${linksColumnNamesSQL}
  from links
`;

export const insertLink = async (
  conn: Connection,
  params: {
    linkId: string;
    path: string;
    index?: number;
    sourceAccountId: string;
    sourceEntityId: string;
    sourceEntityVersionIds: Set<string>;
    destinationAccountId: string;
    destinationEntityId: string;
    destinationEntityVersionId?: string;
    createdAt: Date;
  },
): Promise<void> => {
  await Promise.all([
    conn.query(sql`
      insert into links (${linksColumnNamesSQL})
      values (${sql.join(
        [
          params.linkId,
          params.path,
          params.index === undefined ? null : params.index,
          params.sourceAccountId,
          params.sourceEntityId,
          sql.array(Array.from(params.sourceEntityVersionIds), "uuid"),
          params.destinationAccountId,
          params.destinationEntityId,
          params.destinationEntityVersionId || null,
          params.createdAt.toISOString(),
        ],
        sql`, `,
      )})
    `),
    insertIncomingLink(conn, {
      ...params,
    }),
  ]);
};

export const updateLinkIndices = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    sourceEntityId: string;
    path: string;
    minimumIndex: number;
    operation: "increment" | "decrement";
  },
): Promise<void> => {
  const { operation } = params;
  await conn.query(sql`
    update links
    set index = index + ${operation === "increment" ? 1 : -1}
    where (
      source_account_id = ${params.sourceAccountId}
      and source_entity_id = ${params.sourceEntityId}
      and path = ${params.path}
      and index is not null
      and index >= ${params.minimumIndex}
    );
  `);
};

export const getLinksWithMinimumIndex = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    sourceEntityId: string;
    sourceEntityVersionId: string;
    path: string;
    minimumIndex: number;
  },
): Promise<DBLink[]> => {
  const linkRows = await conn.any(sql<DBLinkRow>`
      ${selectLinks}
      where
        source_account_id = ${params.sourceAccountId}
        and source_entity_id = ${params.sourceEntityId}
        and ${params.sourceEntityVersionId} = ANY(source_entity_version_ids)
        and path = ${params.path}
        and index is not null
        and index >= ${params.minimumIndex}
  `);

  return linkRows.map(mapDBLinkRowToDBLink);
};

export const deleteLinkRow = async (
  conn: Connection,
  params: { sourceAccountId: string; linkId: string },
): Promise<void> => {
  /** @todo: update postgres schema to cascade delete */

  await Promise.all([
    conn.query(sql`
    delete from incoming_links where source_account_id = ${params.sourceAccountId} and link_id = ${params.linkId};
  `),
    conn.query(sql`
    delete from links where source_account_id = ${params.sourceAccountId} and link_id = ${params.linkId};
  `),
  ]);
};

export const addSourceEntityVersionIdToLink = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    linkId: string;
    newSourceEntityVersionId: string;
  },
) => {
  await conn.many(
    sql`
      update links
      set source_entity_version_ids = array_append(links.source_entity_version_ids, ${params.newSourceEntityVersionId})
      where
        source_account_id = ${params.sourceAccountId}
        and link_id = ${params.linkId}
        and not ${params.newSourceEntityVersionId} = ANY(links.source_entity_version_ids)
      returning link_id
    `,
  );
};
