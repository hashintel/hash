import { Connection } from "./types";

import { sql } from "slonik";

/** Insert multiple rows into the outgoing_links table. This function is idempotent. */
export const insertOutgoingLinks = async (
  conn: Connection,
  links: {
    accountId: string;
    entityVersionId: string;
    childAccountId: string;
    childVersionId: string;
  }[]
) => {
  const rows = links.map((link) => [
    link.accountId,
    link.entityVersionId,
    link.childAccountId,
    link.childVersionId,
  ]);
  await conn.query(sql`
    insert into outgoing_links (
      account_id, entity_version_id, child_account_id, child_version_id
    )
    select * from ${sql.unnest(rows, ["uuid", "uuid", "uuid", "uuid"])}
    on conflict do nothing
  `);
};

/** Insert multiple rows into the incoming_links table. This function is idempotent. */
export const insertIncomingLinks = async (
  conn: Connection,
  links: {
    accountId: string;
    entityVersionId: string;
    parentAccountId: string;
    parentVersionId: string;
  }[]
) => {
  const rows = links.map((link) => [
    link.accountId,
    link.entityVersionId,
    link.parentAccountId,
    link.parentVersionId,
  ]);
  await conn.query(sql`
    insert into incoming_links (
      account_id, entity_version_id, parent_account_id, parent_version_id
    )
    select * from ${sql.unnest(rows, ["uuid", "uuid", "uuid", "uuid"])}
    on conflict do nothing
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
