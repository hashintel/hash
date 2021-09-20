import { sql } from "slonik";

import { Connection } from "./types";
import { Entity } from "../adapter";
import { gatherLinks } from "./util";
import { getEntityAccountIdMany } from "./account";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

/** Insert multiple rows into the outgoing_links table. This function is idempotent. */
export const insertOutgoingLinks = async (
  conn: Connection,
  links: {
    srcAccountId: string;
    srcEntityId: string;
    srcEntityVersionId: string;
    dstAccountId: string;
    dstEntityId: string;
    dstEntityVersionId?: string;
  }[]
) => {
  const rows = links.map((link) => [
    link.srcAccountId,
    link.srcEntityId,
    link.dstAccountId,
    link.dstEntityId,
    link.dstEntityVersionId ?? ZERO_UUID,
    link.srcEntityVersionId,
  ]);
  await conn.query(sql`
    insert into outgoing_links as l (
      src_account_id, src_entity_id, dst_account_id, dst_entity_id,
      dst_entity_version_id, src_entity_version_ids
    )
    select
      src_account_id,
      src_entity_id,
      dst_account_id,
      dst_entity_id,
      dst_entity_version_id,
      array[src_entity_version_id] as src_entity_version_ids
    from (
      select * from ${sql.unnest(rows, [
        "uuid",
        "uuid",
        "uuid",
        "uuid",
        "uuid",
        "uuid",
      ])} as rows (
        src_account_id, src_entity_id, dst_account_id, dst_entity_id,
        dst_entity_version_id, src_entity_version_id
      )
    ) as rows
    on conflict on constraint outgoing_links_pk do update
    set
      src_entity_version_ids = l.src_entity_version_ids || EXCLUDED.src_entity_version_ids
    where
      not l.src_entity_version_ids @> EXCLUDED.src_entity_version_ids
  `);
};

/** Insert multiple rows into the incoming_links table. This function is idempotent. */
export const insertIncomingLinks = async (
  conn: Connection,
  links: {
    dstAccountId: string;
    dstEntityId: string;
    srcAccountId: string;
    srcEntityId: string;
  }[]
) => {
  const rows = links.map((link) => [
    link.dstAccountId,
    link.dstEntityId,
    link.srcAccountId,
    link.srcEntityId,
  ]);
  await conn.query(sql`
    insert into incoming_links as l (
      dst_account_id, dst_entity_id, src_account_id, src_entity_id
    )
    select * from ${sql.unnest(rows, ["uuid", "uuid", "uuid", "uuid"])}
    on conflict on constraint incoming_links_pk do nothing
  `);
};

/** Get the fixed entity IDs of all entities which refrence a given entity. */
export const getEntityParentIds = async (
  conn: Connection,
  params: { accountId: string; entityVersionId: string }
) => {
  const rows = await conn.any(sql`
    with p as (
      select parent_account_id, parent_version_id
      from incoming_links
      where
        account_id = ${params.accountId}
        and entity_version_id = ${params.entityVersionId}
    )
    select distinct e.account_id, e.entity_id
    from
      p
      join entity_versions as e on
        e.account_id = p.parent_account_id
        and e.entity_version_id = p.parent_version_id
  `);

  return rows.map((row) => ({
    accountId: row["account_id"] as string,
    entityId: row["entity_id"] as string,
  }));
};

/** Insert the link references made by the provided `entity` into the
 * `incoming_links` and `outgoing_links` tables. Throws an error if `entity` contains a
 * link to another entity which does not exist. */
export const insertLinks = async (conn: Connection, entity: Entity) => {
  const linkedEntities = gatherLinks(entity);
  if (linkedEntities.length === 0) {
    return;
  }
  const links = await getEntityAccountIdMany(conn, { ids: linkedEntities });

  if (links.length !== linkedEntities.length) {
    // At least one link points to an entity which does not exist.
    const missing = linkedEntities
      .map(({ entityId, entityVersionId }) => {
        const found = links.find(
          (link) =>
            link.entityId === entityId &&
            link.entityVersionId === entityVersionId
        );
        return found ? null : { entityId, entityVersionId };
      })
      .filter((it) => it);
    throw new Error(
      `entity ${entity.entityId} with version ID ${
        entity.entityVersionId
      } and type "${
        entity.entityTypeName
      }" links to unknown entities: ${JSON.stringify(missing)}`
    );
  }

  await Promise.all([
    insertOutgoingLinks(
      conn,
      links.map((link) => ({
        srcAccountId: entity.accountId,
        srcEntityId: entity.entityId,
        srcEntityVersionId: entity.entityVersionId,
        dstAccountId: link.accountId,
        dstEntityId: link.entityId,
        dstEntityVersionId: link.entityVersionId,
      }))
    ),

    insertIncomingLinks(
      conn,
      links.map((link) => ({
        dstAccountId: link.accountId,
        dstEntityId: link.entityId,
        srcAccountId: entity.accountId,
        srcEntityId: entity.entityId,
      }))
    ),
  ]);
};
