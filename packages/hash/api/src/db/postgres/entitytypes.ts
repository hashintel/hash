import { sql, UniqueIntegrityConstraintViolationError } from "slonik";

import { Connection } from "./types";
import { selectSystemAccountIds } from "./account";
import { EntityType } from "../adapter";
import { SYSTEM_TYPES, SystemType } from "../../types/entityTypes";
import { Visibility } from "../../graphql/apiTypes.gen";

/** maps a postgres row to its corresponding EntityType object */
export const mapPGRowToEntityType = (row: EntityTypePGRow): EntityType => ({
  accountId: row.account_id,
  entityId: row.entity_type_id,
  entityVersionId: row.entity_type_version_id,
  entityTypeName: "EntityType",
  properties: row.properties,
  metadata: {
    versioned: row.versioned,
    name: row.name,
    extra: {},
  },
  createdByAccountId: row.created_by,
  createdAt: new Date(row.created_at),
  updatedByAccountId: row.updated_by,
  updatedAt: new Date(row.updated_at),
  visibility: Visibility.Public /** @todo implement this */,
});

export type EntityTypePGRow = {
  account_id: string;
  entity_type_id: string;
  entity_type_version_id: string;
  properties: any;
  versioned: boolean;
  created_by: string;
  created_at: number;
  updated_by: string;
  updated_at: number;
  entity_id: string;
  name: string;
  extra: any;
  ["type.entity_type_id"]: string;
  ["type.account_id"]: string;
  ["type.entity_type_version_id"]: string;
  ["type.properties"]: any;
  ["type.created_by"]: string;
  ["type.created_at"]: number;
};

export const selectEntityTypes = sql<EntityTypePGRow>`
  select
    type.account_id,
    type.entity_type_id,
    type.versioned,
    type.extra,
    type.created_by,
    type.created_at,
    type.name,
    ver.properties,
    ver.entity_type_version_id,
    ver.updated_by,
    ver.updated_at
    
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
  params: { systemTypeName: SystemType },
): Promise<EntityType> => {
  const { systemTypeName } = params;
  if (!SYSTEM_TYPES.includes(systemTypeName)) {
    throw new Error(`Provided type ${systemTypeName} is not a system type.`);
  }
  const row = await conn.one<EntityTypePGRow>(sql`
    with all_matches as (
      ${selectSystemEntityTypes(params)}
    )
    select distinct on (entity_type_id) * from all_matches
    order by entity_type_id, updated_at desc
  `);
  return mapPGRowToEntityType(row);
};

export const getAccountEntityTypes = async (
  conn: Connection,
  params: { accountId: string; includeOtherTypesInUse?: boolean | null },
): Promise<EntityType[]> => {
  const query = sql`
    with all_matches as (
      ${selectEntityTypes}
      where type.account_id = ${params.accountId}
        ${
          params.includeOtherTypesInUse
            ? sql`or ver.entity_type_version_id in (
                    select distinct entity_type_version_id 
                    from entity_versions where account_id = ${params.accountId}
                  )`
            : sql``
        }
    ) 
    select distinct on (entity_type_id) * from all_matches
    order by entity_type_id, updated_at desc
  `;
  const rows = await conn.any<EntityTypePGRow>(query);
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
  lock: boolean = false,
): Promise<EntityType | undefined> => {
  const query = lock
    ? sql`${selectEntityTypeVersion(params)} for update`
    : selectEntityTypeVersion(params);

  const row = await conn.maybeOne<EntityTypePGRow>(query);
  return row ? mapPGRowToEntityType(row) : undefined;
};

/** Get an entityType by componentId
 */
export const getEntityTypeByComponentId = async (
  conn: Connection,
  {
    componentId,
  }: {
    componentId: string;
  },
): Promise<EntityType | null> => {
  /**
   * @todo currently we are making an assumption about having distinct componentIds in the system
   * if we would like for other accounts to own entity types imported from componentId, this distinctness needs to change
   * and with it this query.
   */
  const row = await conn.maybeOne<EntityTypePGRow>(sql`
    with all_matches as (
      ${selectEntityTypes}
      where
        -- todo does this play well with citus? Like the index used for this query, we might need to add accountId.
        properties ->> 'componentId' = ${componentId}
    )
    select distinct on (entity_type_id) * from all_matches
    order by entity_type_id, updated_at desc
  `);

  return row ? mapPGRowToEntityType(row) : null;
};

/** Get an entityType by schema $id
 */
export const getEntityTypeBySchema$id = async (
  conn: Connection,
  {
    schema$id,
  }: {
    schema$id: string;
  },
): Promise<EntityType | null> => {
  const row = await conn.maybeOne<EntityTypePGRow>(sql`
    with all_matches as (
      ${selectEntityTypes}
    )
    select distinct on (entity_type_id) * from all_matches
    where
      properties ->> '$id' = ${schema$id}
    order by entity_type_id, updated_at desc

    -- We only want the latest, maybeOne throws if it finds more, which it wouldn't because of distinct on (entity_type_id)
    -- but since we might allow for accounts to be the owner of the imported entitytypes, this would make it so nothing breaks.
    limit 1 
  `);

  return row ? mapPGRowToEntityType(row) : null;
};

export const getJsonSchemaBySchema$id = async (
  conn: Connection,
  schema$id: string,
) => {
  const schema = await getEntityTypeBySchema$id(conn, { schema$id });
  if (schema) {
    return schema.properties;
  } else {
    throw new Error(`Could not find schema with $id = ${schema$id}`);
  }
};

/** Get all types that inherit from a specific type.
 */
export const getEntityTypeChildren = async (
  conn: Connection,
  {
    schemaRef,
  }: {
    schemaRef: string;
  },
): Promise<EntityType[]> => {
  const query = sql`
  with all_entity_types as (${selectEntityTypes})
  select distinct on (entity_type_id) * from all_entity_types
  where properties->'allOf' @> ${schemaRef}
  order by entity_type_id, updated_at desc`;

  const rows = await conn.any<EntityTypePGRow>(query);
  return rows.map(mapPGRowToEntityType);
};

/** Get all types that a specific type inherits from.
 */
export const getEntityTypeParents = async (
  conn: Connection,
  {
    entityTypeId,
  }: {
    entityTypeId: string;
  },
): Promise<EntityType[]> => {
  const query = sql`
  with 
    all_entity_types as (${selectEntityTypes})
  , distinct_types as not MATERIALIZED (
    select distinct on (entity_type_id) * from all_entity_types
    order by entity_type_id, updated_at desc
  )
  , entity_type_ids_in_allof as (
    -- JSONPath to simplify flattening of schema 'allOf' array
    SELECT jsonb_array_elements_text(jsonb_path_query_array(properties, '$.allOf[*]."$ref"')) as json_entity_type_id
    FROM distinct_types
      where entity_type_id = ${entityTypeId}
  )
  SELECT * FROM distinct_types
  WHERE properties->>'$id' IN (select * from entity_type_ids_in_allof)`;

  const rows = await conn.any<EntityTypePGRow>(query);
  return rows.map(mapPGRowToEntityType);
};

/** Get the latest version of an entity type.
 * Returns `undefined` if the entity type does not exist.
 */
export const getEntityTypeLatestVersion = async (
  conn: Connection,
  params: {
    entityId: string;
  },
): Promise<EntityType | null> => {
  const row = await conn.maybeOne<EntityTypePGRow>(sql`
    with all_matches as (
      ${selectEntityTypeAllVersions(params)}
    )
    select distinct on (entity_type_id) * from all_matches
    order by entity_type_id, updated_at desc
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
    createdByAccountId: string;
    createdAt: Date;
  },
): Promise<void> => {
  try {
    await conn.query(sql`
      insert into entity_types (
        name, account_id, entity_type_id, versioned,
        created_by, created_at, metadata_updated_at
      )
      values (
        ${params.name}, ${params.accountId}, ${params.entityId}, true,
        ${params.createdByAccountId}, ${params.createdAt.toISOString()},
        ${params.createdAt.toISOString()}
      )
    `);
  } catch (err) {
    if (err instanceof UniqueIntegrityConstraintViolationError) {
      const { name: entityTypeName, accountId } = params;
      throw new Error(
        `Type name ${entityTypeName} is not unique in accountId ${accountId}`,
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
  },
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
    updatedByAccountId: string;
    updatedAt: Date;
  },
): Promise<void> => {
  await conn.query(sql`
    insert into entity_type_versions (
      account_id, entity_type_id, entity_type_version_id, properties,
      updated_by, updated_at
    )
    values (
      ${params.accountId}, ${params.entityId}, ${params.entityVersionId},
      ${JSON.stringify(params.properties)}, ${params.updatedByAccountId},
      ${params.updatedAt.toISOString()}
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
    updatedByAccountId: string;
    updatedAt: Date;
  },
): Promise<void> => {
  /** @todo consider updating the name if it hasn't changed. */
  await updateEntityTypeMetadata(conn, params);

  await insertEntityTypeVersion(conn, params);
};
