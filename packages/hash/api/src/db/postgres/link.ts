import { sql } from "slonik";
import { uniq } from "lodash";

import { Connection } from "./types";
import { DBLink, Entity } from "../adapter";
import { getEntity, getEntityLatestVersion } from "./entity";
import { DbEntityNotFoundError } from "..";

// const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

// /** Insert multiple rows into the outgoing_links table. This function is idempotent. */
// export const insertOutgoingLinks = async (
//   conn: Connection,
//   links: {
//     sourceAccountId: string;
//     sourceEntityId: string;
//     sourceEntityVersionId: string;
//     destinationAccountId: string;
//     destinationEntityId: string;
//     destinationEntityVersionId?: string;
//   }[],
// ) => {
//   const rows = links.map((link) => [
//     link.sourceAccountId,
//     link.sourceEntityId,
//     link.destinationAccountId,
//     link.destinationEntityId,
//     link.destinationEntityVersionId ?? ZERO_UUID,
//     link.sourceEntityVersionId,
//   ]);
//   await conn.query(sql`
//     insert into outgoing_links as l (
//       source_account_id, source_entity_id, destination_account_id, destination_entity_id,
//       destination_entity_version_id, source_entity_version_ids
//     )
//     select
//       source_account_id,
//       source_entity_id,
//       destination_account_id,
//       destination_entity_id,
//       destination_entity_version_id,
//       array[source_entity_version_id] as source_entity_version_ids
//     from (
//       select * from ${sql.unnest(rows, [
//         "uuid",
//         "uuid",
//         "uuid",
//         "uuid",
//         "uuid",
//         "uuid",
//       ])} as rows (
//         source_account_id, source_entity_id, destination_account_id, destination_entity_id,
//         destination_entity_version_id, source_entity_version_id
//       )
//     ) as rows
//     on conflict on constraint outgoing_links_pk do update
//     set
//       source_entity_version_ids = l.source_entity_version_ids || EXCLUDED.source_entity_version_ids
//     where
//       not l.source_entity_version_ids @> EXCLUDED.source_entity_version_ids
//   `);
// };

// /** Insert multiple rows into the incoming_links table. This function is idempotent. */
// export const insertIncomingLinks = async (
//   conn: Connection,
//   links: {
//     destinationAccountId: string;
//     destinationEntityId: string;
//     sourceAccountId: string;
//     sourceEntityId: string;
//   }[],
// ) => {
//   const rows = links.map((link) => [
//     link.destinationAccountId,
//     link.destinationEntityId,
//     link.sourceAccountId,
//     link.sourceEntityId,
//   ]);
//   await conn.query(sql`
//     insert into incoming_links as l (
//       destination_account_id, destination_entity_id, source_account_id, source_entity_id
//     )
//     select * from ${sql.unnest(rows, ["uuid", "uuid", "uuid", "uuid"])}
//     on conflict on constraint incoming_links_pk do nothing
//   `);
// };

// /** Get the fixed entity IDs of all entities which refrence a given entity. */
// export const getEntityParentIds = async (
//   conn: Connection,
//   params: { accountId: string; entityVersionId: string },
// ) => {
//   const rows = await conn.any(sql`
//     with p as (
//       select parent_account_id, parent_version_id
//       from incoming_links
//       where
//         account_id = ${params.accountId}
//         and entity_version_id = ${params.entityVersionId}
//     )
//     select distinct e.account_id, e.entity_id
//     from
//       p
//       join entity_versions as e on
//         e.account_id = p.parent_account_id
//         and e.entity_version_id = p.parent_version_id
//   `);

//   return rows.map((row) => ({
//     accountId: row.account_id as string,
//     entityId: row.entity_id as string,
//   }));
// };

// /** Insert the link references made by the provided `entity` into the
//  * `incoming_links` and `outgoing_links` tables. Throws a `DbInalidLinksError` if `entity`
//  * contains a link to another entity which does not exist. */
// export const insertLinks = async (conn: Connection, entity: Entity) => {
//   const linkedEntities = gatherLinks(entity);
//   if (linkedEntities.length === 0) {
//     return;
//   }
//   const links = await getEntityAccountIdMany(conn, { ids: linkedEntities });

//   if (links.length !== linkedEntities.length) {
//     // At least one link points to an entity which does not exist.
//     const missing = linkedEntities
//       .map(({ entityId, entityVersionId }) => {
//         const found = links.find(
//           (link) =>
//             link.entityId === entityId &&
//             link.entityVersionId === entityVersionId,
//         );
//         return found ? null : { entityId, entityVersionId };
//       })
//       .filter((it) => it)
//       .map((it) => it!);
//     throw new DbInvalidLinksError({ entity, invalid: missing });
//   }

//   await Promise.all([
//     insertOutgoingLinks(
//       conn,
//       links.map((link) => ({
//         sourceAccountId: entity.accountId,
//         sourceEntityId: entity.entityId,
//         sourceEntityVersionId: entity.entityVersionId,
//         destinationAccountId: link.accountId,
//         destinationEntityId: link.entityId,
//         destinationEntityVersionId: link.entityVersionId,
//       })),
//     ),

//     insertIncomingLinks(
//       conn,
//       links.map((link) => ({
//         destinationAccountId: link.accountId,
//         destinationEntityId: link.entityId,
//         sourceAccountId: entity.accountId,
//         sourceEntityId: entity.entityId,
//       })),
//     ),
//   ]);
// };

// export type OutgoingLink = {
//   accountId: string;
//   entityId: string;
//   entityVersionId?: string;
//   validForSourceEntityVersionIds: Set<string>;
// };

// /** Get the outgoing links made by an entity. Returns an array of objects with the
//  * following fields:
//  *   1. `accountId`: the account ID of the linked entity
//  *   2. `entityId`: the entity ID of the linked entity
//  *   3. `entityVersionId`: `undefined` if the link does not specify a specific version ID
//  *   4. `validForSourceEntityVersionIds`: a `Set` of version IDs for `params.entityId` for
//  *       which the link is valid.
//  */
// export const getEntityOutgoingLinks = async (
//   conn: Connection,
//   params: { accountId: string; entityId: string },
// ): Promise<OutgoingLink[]> => {
//   const rows = await conn.any(sql`
//     select
//       destination_account_id, destination_entity_id, destination_entity_version_id, source_entity_version_ids
//     from
//       outgoing_links
//     where
//       source_account_id = ${params.accountId}
//       and source_entity_id = ${params.entityId}
//   `);
//   return rows.map((row) => {
//     const destinationEntityVersionId =
//       row.destination_entity_version_id as string;
//     return {
//       accountId: row.destination_account_id as string,
//       entityId: row.destination_entity_id as string,
//       entityVersionId:
//         destinationEntityVersionId === ZERO_UUID
//           ? undefined
//           : destinationEntityVersionId,
//       // The version IDs of `params.entityId` for which this link is valid
//       validForSourceEntityVersionIds: new Set(
//         row.source_entity_version_ids as string[],
//       ),
//     };
//   });
// };

// /** Get the accountId and entityId of all entities which link to a given entity. */
// const getEntityIncomingLinks = async (
//   conn: Connection,
//   params: {
//     accountId: string;
//     entityId: string;
//   },
// ) => {
//   const rows = await conn.any(sql`
//     select
//       source_account_id, source_entity_id
//     from
//       incoming_links
//     where
//       destination_account_id = ${params.accountId}
//       and destination_entity_id = ${params.entityId}
//   `);
//   return rows.map((row) => ({
//     accountId: row.source_account_id as string,
//     entityId: row.source_entity_id as string,
//   }));
// };

// export const getAncestorReferences = async (
//   conn: Connection,
//   params: {
//     accountId: string;
//     entityId: string;
//     depth?: number;
//   },
// ) => {
//   // @todo: this implementation cannot handle cycles in the graph.
//   if (params.depth !== undefined && params.depth < 1) {
//     throw new Error("parameter depth must be at least 1");
//   }
//   const depth = params.depth || 1;
//   let refs = [{ accountId: params.accountId, entityId: params.entityId }];
//   for (let i = 0; i < depth; i++) {
//     const incoming = await Promise.all(
//       refs.map((ref) => getEntityIncomingLinks(conn, ref)),
//     );
//     refs = uniq(incoming.flat());
//   }
//   return refs;
// };

// export const getChildren = async (
//   conn: Connection,
//   params: {
//     accountId: string;
//     entityId: string;
//     entityVersionId: string;
//   },
// ): Promise<Entity[]> => {
//   if (!(await getEntity(conn, params))) {
//     throw new DbEntityNotFoundError(params);
//   }
//   // @todo: could include this `filter` in the `where` clause of the query instead
//   const outgoing = (await getEntityOutgoingLinks(conn, params)).filter((link) =>
//     link.validForSourceEntityVersionIds.has(params.entityVersionId),
//   );

//   return Promise.all(
//     outgoing.map(async (link) => {
//       const entity = link.entityVersionId
//         ? await getEntity(conn, {
//             accountId: link.accountId,
//             entityVersionId: link.entityVersionId!,
//           })
//         : await getEntityLatestVersion(conn, link);
//       if (!entity) {
//         throw new DbEntityNotFoundError(link);
//       }
//       return entity;
//     }),
//   );
// };

const mapColumnNamesToSQL = (columnNames: string[], prefix?: string) =>
  sql.join(
    columnNames.map((columnName) =>
      sql.identifier([prefix || [], columnName].flat()),
    ),
    sql`, `,
  );

const outgoingLinksColumnNames = [
  "src_account_id",
  "src_entity_id",
  "link_account_id",
  "link_id",
];

const outgoingLinksColumnNamesSQL = mapColumnNamesToSQL(
  outgoingLinksColumnNames,
);

export const insertOutgoingLink = async (
  conn: Connection,
  params: {
    srcAccountId: string;
    srcEntityId: string;
    linkAccountId: string;
    linkId: string;
  },
): Promise<void> => {
  await conn.query(sql`
    insert into outgoing_links (${outgoingLinksColumnNamesSQL})
    values (${sql.join(
      [
        params.srcAccountId,
        params.srcEntityId,
        params.linkAccountId,
        params.linkId,
      ],
      sql`, `,
    )})
  `);
};

const incomingLinksColumnNames = [
  "dst_account_id",
  "dst_entity_id",
  "link_account_id",
  "link_id",
];

const incomingLinksColumnNamesSQL = mapColumnNamesToSQL(
  incomingLinksColumnNames,
);

export const insertIncomingLink = async (
  conn: Connection,
  params: {
    dstAccountId: string;
    dstEntityId: string;
    linkAccountId: string;
    linkId: string;
  },
): Promise<void> => {
  await conn.query(sql`
    insert into incoming_links (${incomingLinksColumnNamesSQL})
    values (${sql.join(
      [
        params.dstAccountId,
        params.dstEntityId,
        params.linkAccountId,
        params.linkId,
      ],
      sql`, `,
    )})
  `);
};

const linksColumnNames = [
  "account_id",
  "link_id",
  "path",
  "src_account_id",
  "src_entity_id",
  "src_entity_version_ids",
  "dst_account_id",
  "dst_entity_id",
  "dst_entity_version_id",
  "created_at",
];

const linksColumnNamesSQL = mapColumnNamesToSQL(linksColumnNames);

export const insertLink = async (
  conn: Connection,
  params: {
    accountId: string;
    linkId: string;
    path: string;
    srcAccountId: string;
    srcEntityId: string;
    srcEntityVersionIds: Set<string>;
    dstAccountId: string;
    dstEntityId: string;
    dstEntityVersionId?: string;
    createdAt: Date;
  },
): Promise<void> => {
  await conn.query(sql`
    insert into links (${linksColumnNamesSQL})
    values (${sql.join(
      [
        params.accountId,
        params.linkId,
        params.path,
        params.srcAccountId,
        params.srcEntityId,
        sql.array(Array.from(params.srcEntityVersionIds), "uuid"),
        params.dstAccountId,
        params.dstEntityId,
        params.dstEntityVersionId || null,
        params.createdAt.toISOString(),
      ],
      sql`, `,
    )})
  `);
};

export const deleteLink = async (
  conn: Connection,
  params: { accountId: string; linkId: string },
): Promise<void> => {
  /** @todo: update postgres schema to cascade delete */
  await conn.query(sql`
    delete from outgoing_links where link_account_id = ${params.accountId} link_id = ${params.linkId};
    delete from incoming_links where link_account_id = ${params.accountId} link_id = ${params.linkId};
    delete from links where account_id = ${params.accountId} and link_id = ${params.linkId};
  `);
};

type DBLinkRow = {
  account_id: string;
  link_id: string;
  path: string;
  src_account_id: string;
  src_entity_id: string;
  src_entity_version_ids: string[];
  dst_account_id: string;
  dst_entity_id: string;
  dst_entity_version_id: string | null;
  created_at: string;
};

const mapDBLinkRowToDBLink = (row: DBLinkRow): DBLink => ({
  accountId: row.account_id,
  linkId: row.link_id,
  path: row.path,
  srcAccountId: row.src_account_id,
  srcEntityId: row.src_entity_id,
  srcEntityVersionIds: new Set(row.src_entity_version_ids),
  dstAccountId: row.dst_account_id,
  dstEntityId: row.dst_entity_id,
  dstEntityVersionId: row.dst_entity_version_id || undefined,
  createdAt: new Date(row.created_at),
});

export const selectLinks = sql<DBLinkRow>`
  select ${linksColumnNamesSQL}
  from links
`;

export const getLink = async (
  conn: Connection,
  params: { accountId: string; linkId: string },
) => {
  const row = await conn.maybeOne(sql<DBLinkRow>`
    ${selectLinks}
    where
      account_id = ${params.accountId}
      and link_id = ${params.linkId}
  `);

  return row ? mapDBLinkRowToDBLink(row) : null;
};

export const addSrcEntityVersionIdToLink = async (
  conn: Connection,
  params: {
    accountId: string;
    linkId: string;
    newSrcEntityVersionId: string;
  }
) => {
  await conn.one(
    sql`
      update links
      set src_entity_version_ids = array_append(links.src_entity_version_ids, ${params.newSrcEntityVersionId})
      where
        account_id = ${params.accountId}
        and link_id = ${params.linkId}
        and not ${params.newSrcEntityVersionId} = ANY(links.src_entity_version_ids)
    `
  );
};

export const getEntityOutgoingLinks = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    entityVersionId?: string;
  },
) => {
  const rows = await conn.any(sql<DBLinkRow>`
    select ${mapColumnNamesToSQL(linksColumnNames, "links")}
    from links inner join outgoing_links on (
      links.account_id = outgoing_links.link_account_id
      and links.link_id = outgoing_links.link_id
    )
    where
    ${sql.join(
      [
        sql`outgoing_links.src_account_id = ${params.accountId}`,
        sql`outgoing_links.src_entity_id = ${params.entityId}`,
        params.entityVersionId !== undefined
          ? sql`${params.entityVersionId} = ANY(links.src_entity_version_ids)`
          : [],
      ].flat(),
      sql` and `,
    )}
  `);

  return rows.map(mapDBLinkRowToDBLink);
};

// /** Get the accountId and entityId of all entities which link to a given entity. */
export const getEntityIncomingLinks = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
  },
) => {
  const rows = await conn.any(sql<DBLinkRow>`
    select ${mapColumnNamesToSQL(linksColumnNames, "links")}
    from links inner join incoming_links on (
      links.account_id = incoming_links.link_account_id
      and links.link_id = incoming_links.link_id
    )
    where
      incoming_links.destination_account_id = ${params.accountId}
      and incoming_links.destination_entity_id = ${params.entityId}
  `);

  return rows.map(mapDBLinkRowToDBLink);
};

export const getAncestorReferences = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    depth?: number;
  },
) => {
  // @todo: this implementation cannot handle cycles in the graph.
  if (params.depth !== undefined && params.depth < 1) {
    throw new Error("parameter depth must be at least 1");
  }
  const depth = params.depth || 1;
  let refs = [{ accountId: params.accountId, entityId: params.entityId }];
  for (let i = 0; i < depth; i++) {
    const incomingLinks = await Promise.all(
      refs.map((ref) => getEntityIncomingLinks(conn, ref)),
    );

    const incomingRefs = incomingLinks
      .flat()
      .map(({ srcAccountId, srcEntityId }) => ({
        accountId: srcAccountId,
        entityId: srcEntityId,
      }));

    refs = uniq(incomingRefs.flat());
  }
  return refs;
};

export const getChildren = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    entityVersionId: string;
  },
): Promise<Entity[]> => {
  if (!(await getEntity(conn, params))) {
    throw new DbEntityNotFoundError(params);
  }

  const outgoing = await getEntityOutgoingLinks(conn, params);

  return Promise.all(
    outgoing.map(async (link) => {
      const entity = link.dstEntityVersionId
        ? await getEntity(conn, {
            accountId: link.dstAccountId,
            entityVersionId: link.dstEntityVersionId,
          })
        : await getEntityLatestVersion(conn, {
            accountId: link.dstAccountId,
            entityId: link.dstEntityId,
          });
      if (!entity) {
        throw new DbEntityNotFoundError({
          accountId: link.dstAccountId,
          entityId: link.dstEntityId,
          entityVersionId: link.dstEntityVersionId,
        });
      }
      return entity;
    }),
  );
};
