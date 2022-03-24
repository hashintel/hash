import { sql } from "slonik";

import { Connection } from "../../types";
import { DbLinkRow } from "./links.util";
import { DbLinkVersion } from "../../../adapter";
import { mapColumnNamesToSQL } from "../../util";

export const linkVersionsColumnNames = [
  "source_account_id",
  "link_version_id",
  "link_id",
  "index",
  "updated_at",
  "updated_by_account_id",
];

export const linkVersionsColumnNamesSQL = mapColumnNamesToSQL(
  linkVersionsColumnNames,
);

export type DbLinkVersionRow = {
  source_account_id: string;
  link_version_id: string;
  link_id: string;
  index: number | null;
  updated_at: string;
  updated_by_account_id: string;
};

export const selectAllLinkVersions = sql<DbLinkRow>`
  select ${linkVersionsColumnNamesSQL}
  from links
`;

export const selectAllLinkVersionsOfLink = (params: {
  sourceAccountId: string;
  linkId: string;
}) => sql<DbLinkRow>`
  select ${linkVersionsColumnNamesSQL}
  from link_versions
  where
      source_account_id = ${params.sourceAccountId}
    and
      link_id = ${params.linkId}
`;

export const insertLinkVersionRow = async (
  conn: Connection,
  params: {
    dbLinkVersion: DbLinkVersion;
  },
): Promise<void> => {
  const { dbLinkVersion } = params;

  await conn.query(sql`
    insert into link_versions (${linkVersionsColumnNamesSQL})
    values (${sql.join(
      [
        dbLinkVersion.sourceAccountId,
        dbLinkVersion.linkVersionId,
        dbLinkVersion.linkId,
        dbLinkVersion.index ?? null,
        dbLinkVersion.updatedAt.toISOString(),
        dbLinkVersion.updatedByAccountId,
      ],
      sql`, `,
    )})
  `);
};

export const updateLinkVersionRow = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    linkVersionId: string;
    updatedIndex: number;
    updatedAt: Date;
    updatedByAccountId: string;
  },
): Promise<void> => {
  await conn.one(sql`
    update link_versions
    set
      index = ${params.updatedIndex},
      updated_at = ${params.updatedAt.toISOString()},
      updated_by_account_id = ${params.updatedByAccountId}
    where
      source_account_id = ${params.sourceAccountId}
      and link_version_id = ${params.linkVersionId}
  `);
};

export const updateLinkVersionIndices = async (
  conn: Connection,
  params: {
    sourceAccountId: string;
    sourceEntityId: string;
    path: string;
    operation: "increment" | "decrement";
    updatedAt: Date;
    updatedByAccountId: string;
    minimumIndex?: number;
    maximumIndex?: number;
  },
): Promise<void> => {
  const { operation, minimumIndex, maximumIndex } = params;

  await conn.query(sql`
    update link_versions
    set
      index = index + ${operation === "increment" ? 1 : -1},
      updated_at = ${params.updatedAt.toISOString()},
      updated_by_account_id = ${params.updatedByAccountId}
    where ${sql.join(
      [
        sql`source_account_id = ${params.sourceAccountId}`,
        sql`source_entity_id = ${params.sourceEntityId}`,
        sql`path = ${params.path}`,
        sql`and index is not null`,
        typeof minimumIndex !== "undefined"
          ? sql`index >= ${minimumIndex}`
          : [],
        typeof maximumIndex !== "undefined"
          ? sql`index <= ${maximumIndex}`
          : [],
      ].flat(),
      sql` and `,
    )}
  `);
};

export const mapDbLinkVersionRowToDbLinkVersion = (
  row: DbLinkVersionRow,
): DbLinkVersion => ({
  sourceAccountId: row.source_account_id,
  linkVersionId: row.link_version_id,
  linkId: row.link_id,
  index: row.index === null ? undefined : row.index,
  updatedAt: new Date(row.updated_at),
  updatedByAccountId: row.updated_by_account_id,
});
