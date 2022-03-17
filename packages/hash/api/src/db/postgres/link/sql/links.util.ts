import { sql, ValueExpressionType } from "slonik";

import {
  DBLinkVersionRow,
  linkVersionsColumnNames,
  insertLinkVersionRow,
} from "./link_versions.util";
import { Connection } from "../../types";
import { DBLink, DBLinkWithIndex } from "../../../adapter";
import { mapColumnNamesToSQL } from "../../util";
import { insertIncomingLinkRow } from "./incoming_links.util";

export const linksColumnNames = [
  "link_id",
  "path",
  "source_account_id",
  "source_entity_id",
  "applied_to_source_at",
  "applied_to_source_by_account_id",
  "removed_from_source_at",
  "removed_from_source_by_account_id",
  "destination_account_id",
  "destination_entity_id",
  "destination_entity_version_id",
];

export const linksColumnNamesSQL = mapColumnNamesToSQL(linksColumnNames);

export type DBLinkRow = {
  link_id: string;
  path: string;
  index: number | null;
  source_account_id: string;
  source_entity_id: string;
  applied_to_source_at: string;
  applied_to_source_by_account_id: string;
  removed_from_source_at: string | null;
  removed_from_source_by_account_id: string | null;
  destination_account_id: string;
  destination_entity_id: string;
  destination_entity_version_id: string | null;
};

export type DBLinkWithVersionRow = DBLinkRow & DBLinkVersionRow;

/** selects all link versions in the datastore */
const selectAllLinkVersions = sql<DBLinkWithVersionRow>`
  select
    ${mapColumnNamesToSQL(linksColumnNames, "links")},
    ${mapColumnNamesToSQL(
      linkVersionsColumnNames.filter(
        (column) => !linksColumnNames.includes(column),
      ),
      "link_versions",
    )}
  from links join link_versions on links.link_id = link_versions.link_id
`;

/** selects all links in the datastore with their latest version */
const selectAllLatestVersionsOfLinks = sql<DBLinkWithVersionRow>`
  with all_link_versions as (${selectAllLinkVersions})
  select distinct on (link_id) *
  from all_link_versions
  order by link_id, updated_at desc
`;

/** select all links with the latest version before a given timestamp */
const selectAllLatestVersionsOfLinksBeforeTimestamp = (params: {
  beforeTimestamp: Date;
}) =>
  sql<DBLinkWithVersionRow>`
    with all_link_versions as (
      ${selectAllLinkVersions}
      where link_versions.updated_at <= ${params.beforeTimestamp.toISOString()}
    )
    select distinct on (link_id) *
    from all_link_versions
    order by link_id, updated_at desc
`;

/** selects all versions of a specifc link */
const selectAllVersionsOfLink = (params: {
  sourceAccountId: string;
  linkId: string;
}) => sql<DBLinkWithVersionRow>`
  with all_links as (${selectAllLinkVersions})
  select *
  from all_links
  where
    source_account_id = ${params.sourceAccountId} and link_id = ${params.linkId}
`;

/** selects the latest version of a specific link */
export const selectLatestVersionOfLink = (params: {
  sourceAccountId: string;
  linkId: string;
}) => sql<DBLinkWithVersionRow>`
  with all_link_versions as (${selectAllVersionsOfLink(params)})
  select distinct on (link_id) *
  from all_link_versions
  order by link_id, updated_at desc
`;

export const selectAllLinksWithDestinationEntity = (params: {
  destinationAccountId: string;
  destinationEntityId: string;
}) => sql<DBLinkWithVersionRow>`
  with all_links as (${selectAllLatestVersionsOfLinks})
  select *
  from all_links
  where
  ${sql.join(
    [
      sql`destination_account_id = ${params.destinationAccountId}`,
      sql`destination_entity_id = ${params.destinationEntityId}`,
    ].flat(),
    sql` and `,
  )}
`;

export const selectAllLinksWithSourceEntity = (params: {
  sourceAccountId: string;
  sourceEntityId: string;
  activeAt?: Date;
  path?: string;
  additionalClauses?: ValueExpressionType[];
}) => sql<DBLinkWithVersionRow>`
  with all_links as (${
    params.activeAt
      ? selectAllLatestVersionsOfLinksBeforeTimestamp({
          beforeTimestamp: params.activeAt,
        })
      : selectAllLatestVersionsOfLinks
  })
  select *
  from all_links
  where
    ${sql.join(
      [
        sql`source_account_id = ${params.sourceAccountId}`,
        sql`source_entity_id = ${params.sourceEntityId}`,
        params.activeAt
          ? [
              // the link was applied before the timestamp
              sql`applied_to_source_at <= ${params.activeAt.toISOString()}`,
              // either the link was removed after the timestamp, or the link hasn't been removed yet
              sql`(
                  removed_from_source_at >= ${params.activeAt.toISOString()}
                or
                  removed_from_source_at is null 
              )`,
            ]
          : [
              // the link hasn't been removed yet (so can be considered as "active" right now)
              sql`removed_from_source_at is null`,
            ],
        params.path !== undefined ? sql`path = ${params.path}` : [],
        ...(params.additionalClauses ?? []),
      ].flat(),
      sql` and `,
    )}
`;

/**
 * Inserts a new link into the `links` table, and into the `incoming_links`
 * lookup table.
 */
export const insertLink = async (
  conn: Connection,
  params: {
    dbLink: DBLink;
  },
): Promise<void> => {
  const { dbLink } = params;

  await Promise.all([
    conn.query(sql`
      insert into links (${linksColumnNamesSQL})
      values (${sql.join(
        [
          dbLink.linkId,
          dbLink.path,
          dbLink.sourceAccountId,
          dbLink.sourceEntityId,
          dbLink.appliedToSourceAt.toISOString(),
          dbLink.appliedToSourceByAccountId,
          null,
          null,
          dbLink.destinationAccountId,
          dbLink.destinationEntityId,
          dbLink.destinationEntityVersionId ?? null,
        ],
        sql`, `,
      )})
    `),
    insertLinkVersionRow(conn, {
      dbLinkVersion: dbLink,
    }),
    insertIncomingLinkRow(conn, {
      dbIncomingLink: dbLink,
    }),
  ]);
};

export const mapDBRowsToDBLink = (
  dbLinkWithVersionRow: DBLinkWithVersionRow,
): DBLink => ({
  linkId: dbLinkWithVersionRow.link_id,
  linkVersionId: dbLinkWithVersionRow.link_version_id,
  path: dbLinkWithVersionRow.path,
  index:
    dbLinkWithVersionRow.index === null
      ? undefined
      : dbLinkWithVersionRow.index,
  sourceAccountId: dbLinkWithVersionRow.source_account_id,
  sourceEntityId: dbLinkWithVersionRow.source_entity_id,
  appliedToSourceAt: new Date(dbLinkWithVersionRow.applied_to_source_at),
  appliedToSourceByAccountId:
    dbLinkWithVersionRow.applied_to_source_by_account_id,
  removedFromSourceAt: dbLinkWithVersionRow.removed_from_source_at
    ? new Date(dbLinkWithVersionRow.removed_from_source_at)
    : undefined,
  removedFromSourceByAccountId:
    dbLinkWithVersionRow.removed_from_source_by_account_id ?? undefined,
  destinationAccountId: dbLinkWithVersionRow.destination_account_id,
  destinationEntityId: dbLinkWithVersionRow.destination_entity_id,
  destinationEntityVersionId:
    dbLinkWithVersionRow.destination_entity_version_id ?? undefined,
  updatedAt: new Date(dbLinkWithVersionRow.updated_at),
  updatedByAccountId: dbLinkWithVersionRow.updated_by_account_id,
});

export const getIndexedLinks = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    sourceEntityId: string;
    activeAt?: Date;
    path: string;
    minimumIndex?: number;
    maximumIndex?: number;
  },
): Promise<DBLinkWithIndex[]> => {
  const { minimumIndex, maximumIndex } = params;

  const linkRows = await conn.any(
    selectAllLinksWithSourceEntity({
      ...params,
      additionalClauses: [
        sql`index is not null`,
        typeof minimumIndex === "undefined"
          ? []
          : sql`index >= ${minimumIndex}`,
        typeof maximumIndex === "undefined"
          ? []
          : sql`index <= ${maximumIndex}`,
      ].flat(),
    }),
  );

  return linkRows.map((linkRow) => {
    const dbLink = mapDBRowsToDBLink(linkRow);
    return {
      ...dbLink,
      index: dbLink.index!,
    };
  });
};

export const removeLinkFromSource = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    linkId: string;
    removedFromSourceAt: Date;
    removedFromSourceBy: string;
  },
): Promise<void> => {
  await conn.query(sql`
    update links
    set
      removed_from_source_at = ${params.removedFromSourceAt.toISOString()},
      removed_from_source_by_account_id = ${params.removedFromSourceBy}
    where (
      source_account_id = ${params.sourceAccountId}
      and link_id = ${params.linkId}
    );
  `);
};

export const deleteLinkRow = async (
  conn: Connection,
  params: { sourceAccountId: string; linkId: string },
): Promise<void> => {
  /** @todo: update postgres schema to cascade delete */

  await Promise.all([
    conn.query(sql`
      delete from incoming_links
      where source_account_id = ${params.sourceAccountId}
      and link_id = ${params.linkId};
  `),
    conn.query(sql`
      delete from links
      where
          source_account_id = ${params.sourceAccountId}
        and
          link_id = ${params.linkId};
  `),
  ]);
};
