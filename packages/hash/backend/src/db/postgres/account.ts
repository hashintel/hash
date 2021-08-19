import { sql } from "slonik";

import { Connection } from "./types";

// @ts-ignore
import { SYSTEM_ACCOUNT_NAME } from "../../lib/config";

export const insertAccount = async (
  conn: Connection,
  params: { accountId: string }
): Promise<void> => {
  await conn.query(sql`
    insert into accounts (account_id) values (${params.accountId})
    on conflict (account_id) do nothing`);
};

export const insertEntityAccount = async (
  conn: Connection,
  params: { entityVersionId: string; accountId: string }
): Promise<void> => {
  await conn.query(sql`
    insert into entity_account (entity_version_id, account_id)
    values (${params.entityVersionId}, ${params.accountId})`);
};

/** Get the account ID of multiple entities. Returns a map from entity ID to account ID. */
export const getEntityAccountIdMany = async (
  conn: Connection,
  entityVersionIds: Set<string>
): Promise<Map<string, string>> => {
  const rows = await conn.any(sql`
    select entity_version_id, account_id from entity_account
    where
      entity_version_id = any(${sql.array(
        Array.from(entityVersionIds),
        "uuid"
      )})
  `);

  const result = new Map<string, string>();
  for (const row of rows) {
    result.set(row["entity_version_id"] as string, row["account_id"] as string);
  }

  return result;
};

/**
 * @todo cache this value instead of requiring a join each query,
 *    it'll be unchanged once the instance is configured
 */
export const selectSystemAccountIds = sql`
  select account_id from entity_versions
  where account_id = entity_id
    and properties->>'shortname' = ${SYSTEM_ACCOUNT_NAME}
`;