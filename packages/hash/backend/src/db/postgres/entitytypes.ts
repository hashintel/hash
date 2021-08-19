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
  id: row["entity_type_version_id"] as string,
  properties: row["properties"],
  metadata: {
    versioned: row["versioned"] as boolean,
  },
  metadataId: row["entity_type_id"] as string,
  createdById: row["created_by"] as string,
  createdAt: new Date(row["created_at"] as number),
  updatedAt: new Date(row["updated_at"] as number),
  visibility: Visibility.Public /** @todo implement this */,
});

export const selectEntityTypes = sql`
  select
    type.account_id, type.entity_type_id, type.versioned,
    type.created_by, type.extra,
    ver.updated_at, ver.created_at, ver.properties, ver.entity_type_version_id
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
  where type.name = ${params.systemTypeName}
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
  where name = ${params.systemTypeName}
    and account_id in (${selectSystemAccountIds})
  limit 1
`;

export const selectEntityTypeVersion = (params: {
  entityTypeVersionId: string;
}) => sql`
  ${selectEntityTypes}
  where ver.entity_type_version_id = ${params.entityTypeVersionId}
`;

export const selectEntityTypeAllVersions = (params: {
  entityTypeId: string;
}) => sql`
  ${selectEntityTypes}
  where type.entity_type_id = ${params.entityTypeId}
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
    order by entity_type_id, created_at desc
  `);
  return row ? mapPGRowToEntityType(row) : undefined;
};

/** @todo - put this to use to list an account's types */
export const getAccountEntityTypes = async (
  conn: Connection,
  accountId: string
): Promise<EntityType[]> => {
  const rows = await conn.any(sql`
    ${selectEntityTypes}
    where account_id = ${accountId}
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
    entityTypeVersionId: string;
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
    entityTypeId: string;
  }
): Promise<EntityType | undefined> => {
  const row = await conn.maybeOne(sql`
    with all_matches as (
      ${selectEntityTypeAllVersions(params)}
    )
    select distinct on (entity_type_id) * from all_matches
    order by entity_type_id, updated_at desc`);
  return row ? mapPGRowToEntityType(row) : undefined;
};

export const insertEntityType = async (
  conn: Connection,
  params: {
    accountId: string;
    entityTypeId: string;
    name: string;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }
): Promise<void> => {
  console.log({ params });
  const { accountId, entityTypeId, name, createdById, createdAt, updatedAt } =
    params;
  try {
    // The "on conflict do nothing" clause is required here because multiple transactions
    // may try to insert at the same time causing a conflict on the UNIQUE constraint on
    // entity_types name column.
    await conn.query(sql`
      insert into entity_types (
        name, account_id, entity_type_id, versioned,
        created_by, created_at, updated_at
       )
       values (
        ${name}, ${accountId}, ${entityTypeId}, true, 
        ${createdById}, ${createdAt.toISOString()}, ${updatedAt.toISOString()}
       ) on conflict do nothing`);
  } catch (err) {
    if (err instanceof UniqueIntegrityConstraintViolationError) {
      throw new Error(
        `Type name ${name} is not unique in accountId ${accountId}`
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
const updateEntityTypeMetadata = async (
  conn: Connection,
  params: {
    entityTypeId: string;
    name: string;
    updatedAt: Date;
  }
): Promise<void> => {
  try {
    await conn.query(sql`
      update entity_types 
        set name = ${params.name},
        updated_at = ${params.updatedAt.toISOString()}
      where entity_type_id = ${params.entityTypeId}
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
    entityTypeId: string;
    entityTypeVersionId: string;
    properties: Record<string, any>;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }
): Promise<void> => {
  const {
    accountId,
    entityTypeId,
    entityTypeVersionId,
    properties,
    createdById,
    createdAt,
    updatedAt,
  } = params;
  await conn.query(sql`
    insert into entity_type_versions (
      account_id, entity_type_id, entity_type_version_id, properties,
      created_by, created_at, updated_at
    )
    values (
      ${accountId}, ${entityTypeId}, ${entityTypeVersionId}, 
      ${JSON.stringify(properties)}, 
      ${createdById}, ${createdAt.toISOString()}, ${updatedAt.toISOString()}
    )
  `);
};

/** @todo handle non-versioned entity types */
export const updateEntityType = async (
  conn: Connection,
  params: {
    accountId: string;
    entityTypeId: string;
    entityTypeVersionId: string;
    name: string;
    properties: Record<string, any>;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }
): Promise<void> => {
  // We need to update the metadata record to increase the updatedAt anyway,
  // but could consider not updating the name if it hasn't changed.
  /** @todo consider refactoring to not always set name again */
  await updateEntityTypeMetadata(conn, params);

  await insertEntityTypeVersion(conn, params);
};
