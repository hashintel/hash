import { Connection } from "./types";
import { Entity } from "../adapter";

import { sql } from "slonik";

/** Insert multiple rows into the outgoing_links table. This function is idempotent. */
export const insertOutgoingLinks = async (
  conn: Connection,
  links: {
    accountId: string;
    entityId: string;
    childAccountId: string;
    childId: string;
  }[]
) => {
  const rows = links.map((link) => [
    link.accountId,
    link.entityId,
    link.childAccountId,
    link.childId,
  ]);
  await conn.query(sql`
    insert into outgoing_links (account_id, entity_id, child_account_id, child_id)
    select * from ${sql.unnest(rows, ["uuid", "uuid", "uuid", "uuid"])}
    on conflict do nothing
  `);
};

/** Insert multiple rows into the incoming_links table. This function is idempotent. */
export const insertIncomingLinks = async (
  conn: Connection,
  links: {
    accountId: string;
    entityId: string;
    parentAccountId: string;
    parentId: string;
  }[]
) => {
  const rows = links.map((link) => [
    link.accountId,
    link.entityId,
    link.parentAccountId,
    link.parentId,
  ]);
  await conn.query(sql`
    insert into incoming_links (account_id, entity_id, parent_account_id, parent_id)
    select * from ${sql.unnest(rows, ["uuid", "uuid", "uuid", "uuid"])}
    on conflict do nothing
  `);
};

/** Get the IDs of all entities which refrence a given entity. */
export const getEntityParentIds = async (
  conn: Connection,
  params: { entity: Entity }
) => {
  const { accountId, entityId } = params.entity;
  const rows = await conn.any(sql`
    select parent_account_id, parent_id from incoming_links
    where account_id = ${accountId} and entity_id = ${entityId}`);

  return rows.map((row) => ({
    accountId: row["parent_account_id"] as string,
    entityId: row["parent_id"] as string,
  }));
};
