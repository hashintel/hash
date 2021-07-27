import { Connection } from "./types";
import { Entity } from "../adapter";

import { sql } from "slonik";

export const insertOutgoingLink = async (
  client: Connection,
  params: {
    accountId: string;
    entityId: string;
    childAccountId: string;
    childId: string;
  }
) => {
  await client.query(sql`
    insert into outgoing_links (account_id, entity_id, child_account_id, child_id)
    values (
      ${params.accountId}, ${params.entityId}, ${params.childAccountId},
      ${params.childId}
    )
  `);
};

export const insertIncomingLink = async (
  client: Connection,
  params: {
    accountId: string;
    entityId: string;
    parentAccountId: string;
    parentId: string;
  }
) => {
  await client.query(sql`
    insert into incoming_links (account_id, entity_id, parent_account_id, parent_id)
    values (
      ${params.accountId}, ${params.entityId}, ${params.parentAccountId},
      ${params.parentId}
    )
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
