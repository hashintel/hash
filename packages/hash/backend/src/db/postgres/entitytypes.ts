import {
  QueryResultRowType,
  sql,
  UniqueIntegrityConstraintViolationError,
} from "slonik";

import { Connection } from "./types";
import { selectSystemAccountIds } from "./account";
import { EntityType } from "../adapter";
import { SYSTEM_TYPES, SystemType } from "../../types/entityTypes";
import { Visibility } from "../../graphql/apiTypes.gen";

/** maps a postgres row to its corresponding EntityType object */
export const mapPGRowToEntityType = (row: QueryResultRowType): EntityType => ({
  accountId: row["account_id"] as string,
  entityId: row["entity_type_id"] as string,
  entityVersionId: row["entity_type_version_id"] as string,
  entityTypeName: "EntityType",
  properties: row["properties"],
  metadata: {
    versioned: row["versioned"] as boolean,
    extra: {},
  },
  createdById: row["created_by"] as string,
  entityCreatedAt: new Date(row["created_at"] as number),
  entityVersionCreatedAt: new Date(row["version_created_at"] as number),
  entityVersionUpdatedAt: new Date(row["version_updated_at"] as number),
  visibility: Visibility.Public /** @todo implement this */,
});

export const selectEntityTypes = sql`
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
`;

/**
 * Select all versions of a specified system entity type.
 * @todo cache this, system types won't change often
 */
export const selectSystemEntityTypes = (params: {
  systemTypeName: SystemType;
}) => sql`
  ${selectEntityTypes}
  where
    type.name = ${params.systemTypeName}
    and type.account_id in (${selectSystemAccountIds})
`;

/**
 * Select the fixed entity_type_id of a given system type
 * @todo cache this, it won't change after the initial migration
 */
export const selectSystemEntityTypeIds = (params: {
  systemTypeName: SystemType;
}) => sql`
  select entity_type_id from entity_types
  where
    name = ${params.systemTypeName}
    and account_id in (${selectSystemAccountIds})
  limit 1
`;

export const selectEntityTypeVersion = (params: {
  entityVersionId: string;
}) => sql`
  ${selectEntityTypes}
  where ver.entity_type_version_id = ${params.entityVersionId}
`;

export const selectEntityTypeAllVersions = (params: {
  entityId: string;
}) => sql`
  ${selectEntityTypes}
  where type.entity_type_id = ${params.entityId}
`;

/**
 * Get the latest version of a system entity type by name
 */
export const getSystemTypeLatestVersion = async (
  conn: Connection,
  params: { systemTypeName: SystemType }
): Promise<EntityType | undefined> => {
  const { systemTypeName } = params;
  if (!SYSTEM_TYPES.includes(systemTypeName)) {
    throw new Error(`Provided type ${systemTypeName} is not a system type.`);
  }
  const row = await conn.maybeOne(sql`
    with all_matches as (
      ${selectSystemEntityTypes(params)}
    )
    select distinct on (entity_type_id) * from all_matches
    order by entity_type_id, version_created_at desc
  `);
  return row ? mapPGRowToEntityType(row) : undefined;
};

export const getAccountEntityTypes = async (
  conn: Connection,
  params: { accountId: string }
): Promise<EntityType[]> => {
  const rows = await conn.any(sql`
    ${selectEntityTypes}
    where type.account_id = ${params.accountId}
  `);
  return rows.map(mapPGRowToEntityType);
};

/** Get an entity type of a specified version.
 * The optional argument `lock` may be set to `true` to lock the entity
 * for selects or updates until the transaction completes.
 * Returns `undefined` if the entity type version does not exist.
 */
export const getEntityType = async (
  conn: Connection,
  params: {
    entityVersionId: string;
  },
  lock: boolean = false
): Promise<EntityType | undefined> => {
  const query = lock
    ? sql`${selectEntityTypeVersion(params)} for update`
    : selectEntityTypeVersion(params);

  const row = await conn.maybeOne(query);
  return row ? mapPGRowToEntityType(row) : undefined;
};

/** Get the latest version of an entity type.
 * Returns `undefined` if the entity type does not exist.
 */
export const getEntityTypeLatestVersion = async (
  conn: Connection,
  params: {
    entityId: string;
  }
): Promise<EntityType | null> => {
  const row = await conn.maybeOne(sql`
    with all_matches as (
      ${selectEntityTypeAllVersions(params)}
    )
    select distinct on (entity_type_id) * from all_matches
    order by entity_type_id, version_created_at desc
  `);
  return row ? mapPGRowToEntityType(row) : null;
};

// @todo: `versioned` should be a parameter here
export const insertEntityType = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    name: string;
    createdById: string;
    entityCreatedAt: Date;
  }
): Promise<void> => {
  try {
    // The "on conflict do nothing" clause is required here because multiple transactions
    // may try to insert at the same time causing a conflict on the UNIQUE constraint on
    // entity_types name column.
    await conn.query(sql`
      insert into entity_types (
        name, account_id, entity_type_id, versioned,
        created_by, created_at, metadata_updated_at
      )
      values (
        ${params.name}, ${params.accountId}, ${params.entityId}, true,
        ${params.createdById}, ${params.entityCreatedAt.toISOString()},
        ${params.entityCreatedAt.toISOString()}
      )
      on conflict do nothing
    `);
  } catch (err) {
    if (err instanceof UniqueIntegrityConstraintViolationError) {
      const { name: entityTypeName, accountId } = params;
      throw new Error(
        `Type name ${entityTypeName} is not unique in accountId ${accountId}`
      );
    }
    throw err;
  }
};

/**
 * Update the entityType record to set updatedAt and name.
 * Throws an error if the name is not unique in the account.
 * WARNING: only updates the metadata record - take separate action
 *    to insertEntityTypeVersion with the same name.
 */
export const updateEntityTypeMetadata = async (
  conn: Connection,
  params: {
    entityId: string;
    name: string;
  }
): Promise<void> => {
  try {
    await conn.query(sql`
      update entity_types
        set name = ${params.name},
        metadata_updated_at = ${new Date().toISOString()}
      where entity_type_id = ${params.entityId}
    `);
  } catch (err) {
    if (err instanceof UniqueIntegrityConstraintViolationError) {
      throw new Error(`Type name ${params.name} is not unique in account`);
    }
    throw err;
  }
};

export const insertEntityTypeVersion = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    entityVersionId: string;
    properties: Record<string, any>;
    createdById: string;
    entityVersionCreatedAt: Date;
    entityVersionUpdatedAt: Date;
  }
): Promise<void> => {
  await conn.query(sql`
    insert into entity_type_versions (
      account_id, entity_type_id, entity_type_version_id, properties,
      created_by, created_at, updated_at
    )
    values (
      ${params.accountId}, ${params.entityId}, ${params.entityVersionId},
      ${JSON.stringify(params.properties)}, ${params.createdById},
      ${params.entityVersionCreatedAt.toISOString()},
      ${params.entityVersionUpdatedAt.toISOString()}
    )
  `);
};

export const updateVersionedEntityType = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    entityVersionId: string;
    name: string;
    properties: Record<string, any>;
    createdById: string;
    entityVersionCreatedAt: Date;
    entityVersionUpdatedAt: Date;
  }
): Promise<void> => {
  /** @todo consider updating the name if it hasn't changed. */
  await updateEntityTypeMetadata(conn, params);

  await insertEntityTypeVersion(conn, params);
};
