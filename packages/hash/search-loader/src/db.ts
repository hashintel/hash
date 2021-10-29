// This module is temporary. If we move the DbAdapter from @hashintel/hash-backend to
// @hashintel/hash-backend-utils we can use it here.
import { PgPool } from "@hashintel/hash-backend-utils/postgres";
import { sql } from "slonik";

let systemAccountId: string | undefined;

// @todo: define LocalCache class, or similar, which will limit the memory size of the
// Map, and overflow onto a remote cache (Redis)
const entityTypesCache = new Map<string, object>();

/**
 * Get the system account ID. The value is cached after the first call.
 */
export const getSystemAccountId = async (pool: PgPool) => {
  if (systemAccountId) {
    return systemAccountId;
  }
  const res = await pool.oneFirst(sql`
    select account_id from entity_versions
    where account_id = entity_id
      and properties->>'shortname' = 'hash'
  `);
  systemAccountId = res as string;
  return systemAccountId;
};

/** Convert a snake_case string to camelCase. */
const snakeToCamel = (str: string) => {
  // Leave leading underscores as they are
  let startIdx = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charAt(i) === "_") {
      startIdx += 1;
    } else {
      break;
    }
  }
  const leading = str.slice(0, startIdx);
  const remaining = str
    .slice(startIdx)
    .toLowerCase()
    .replace(/_[^_]/g, (group) => group.slice(-1).toUpperCase());
  return leading + remaining;
};

/** Get an entity type by its version ID. */
export const getEntityType = async (
  pool: PgPool,
  params: { entityTypeVersionId: string }
): Promise<Record<string, any>> => {
  const key = params.entityTypeVersionId;
  let value = entityTypesCache.get(key);
  if (value) {
    return value;
  }
  const row = await pool.one(sql`
    select
      type.account_id,
      type.entity_type_id,
      type.versioned,
      type.created_by,
      type.extra,
      type.created_at,
      type.name,
      ver.created_at as version_created_at,
      ver.updated_at as version_updated_at,
      ver.properties,
      ver.entity_type_version_id
    from
      entity_types as type
      join entity_type_versions as ver on
          type.entity_type_id = ver.entity_type_id
    where
      ver.entity_type_version_id = ${params.entityTypeVersionId}
  `);
  value = Object.fromEntries(
    Object.entries(row).map(([kk, vv]) => [snakeToCamel(kk), vv])
  );
  entityTypesCache.set(key, value);
  return value;
};
