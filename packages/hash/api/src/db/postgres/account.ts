import { NotFoundError, sql } from "slonik";

import { SYSTEM_ACCOUNT_SHORTNAME } from "@hashintel/hash-backend-utils/system";
import { Connection } from "./types";

import { DbEntityNotFoundError } from "../errors";

export const insertAccount = async (
  conn: Connection,
  params: { accountId: string },
): Promise<void> => {
  await conn.query(sql`
    insert into accounts (account_id) values (${params.accountId})
    on conflict (account_id) do nothing`);
};

export const insertEntityAccount = async (
  conn: Connection,
  params: { entityId: string; entityVersionId: string; accountId: string },
): Promise<void> => {
  await conn.query(sql`
    insert into entity_account (entity_version_id, entity_id, account_id)
    values (${params.entityVersionId}, ${params.entityId}, ${params.accountId})
    on conflict do nothing
  `);
};

/** Checks whether an account exists on the account table.
 * Returns true if it exists or false if not */
export const accountExists = async (
  conn: Connection,
  params: { accountId: string },
): Promise<boolean> => {
  return await conn.exists(sql`
    select account_id from accounts
    where account_id = ${params.accountId} limit 1
  `);
};

/** Get the account ID of an entity. */
export const getEntityAccountId = async (
  conn: Connection,
  params: { entityId: string; entityVersionId?: string },
): Promise<string> => {
  const { entityId, entityVersionId } = params;
  try {
    const row = params.entityVersionId
      ? await conn.one(sql`
        select account_id from entity_account
        where entity_version_id = ${entityVersionId!}
      `)
      : await conn.one(sql`
        select account_id from entity_account
        where entity_id = ${entityId} limit 1
      `);
    return row.account_id as string;
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new DbEntityNotFoundError({ entityId, entityVersionId });
    }
    throw err;
  }
};

/** Get the account ID of multiple entities. Returns a map from entity ID to account ID. */
/** Get the account ID of multiple entities. */
export const getEntityAccountIdMany = async (
  conn: Connection,
  params: { ids: { entityId: string; entityVersionId?: string }[] },
): Promise<
  { entityId: string; entityVersionId?: string; accountId: string }[]
> => {
  // Query 1: get the account IDs for links with just the entityId set
  const entityIds = params.ids
    .filter((link) => !link.entityVersionId)
    .map((link) => link.entityId);

  // Query 2: get the account IDs for the links with the entityVersionId set
  const entityVersionIds = params.ids
    .filter((link) => link.entityVersionId)
    .map((link) => link.entityVersionId!);

  const [rows1, rows2] = await Promise.all([
    entityIds.length > 0
      ? conn.any(sql`
        select distinct entity_id, account_id from entity_account
        where
          entity_id = any(${sql.array(entityIds, "uuid")})
      `)
      : [],

    entityVersionIds.length > 0
      ? conn.any(sql`
        select entity_id, entity_version_id, account_id from entity_account
        where
          entity_version_id = any(${sql.array(entityVersionIds, "uuid")})
      `)
      : [],
  ]);

  const result1 = rows1.map((row) => ({
    accountId: row.account_id as string,
    entityId: row.entity_id as string,
    entityVersionId: undefined as string | undefined,
  }));

  const result2 = rows2.map((row) => ({
    accountId: row.account_id as string,
    entityId: row.entity_id as string,
    entityVersionId: row.entity_version_id as string | undefined,
  }));

  // Return in same order as params.ids
  const ids = new Map();
  for (const res of result1.concat(result2)) {
    ids.set(res.entityId + (res.entityVersionId || ""), res);
  }
  return params.ids
    .map((id) => ids.get(id.entityId + (id.entityVersionId || "")))
    .filter((id) => id);
};

/**
 * @todo cache this value instead of requiring a join each query,
 *    it'll be unchanged once the instance is configured
 */
export const selectSystemAccountIds = sql`
  select account_id from entity_versions
  where account_id = entity_id
    and properties->>'shortname' = ${SYSTEM_ACCOUNT_SHORTNAME}
`;

// The system account ID never changes, so we can cache it here.
let cachedSystemAccountId: string | undefined;

export const getSystemAccountId = async (conn: Connection) => {
  if (cachedSystemAccountId) {
    return cachedSystemAccountId;
  }
  const res = await conn.oneFirst(selectSystemAccountIds);
  cachedSystemAccountId = res as string;
  return cachedSystemAccountId;
};
