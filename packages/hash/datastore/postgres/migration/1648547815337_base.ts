/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";
import { stripNewLines } from "../util";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    "accounts",
    {
      account_id: {
        type: "uuid",
        primaryKey: true,
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "entity_types",
    {
      entity_type_id: {
        type: "uuid",
        notNull: true,
        primaryKey: true,
        comment: "The fixed ID across all versions of an entity type",
      },
      /**
       * Note: the entity_types table does not include account_id in its primary key,
       * some types are shared access across all accounts, and for performance reasons
       * we do not want to shard the entity_types table by account_id.
       */
      account_id: {
        type: "uuid",
        notNull: true,
        references: {
          name: "accounts",
        },
        comment: "",
        deferrable: true,
      },
      created_by_account_id: {
        type: "uuid",
        notNull: true,
        references: {
          name: "accounts",
        },
        comment: "",
        deferrable: true,
      },
      created_at: {
        type: "timestamp with time zone",
        notNull: true,
        comment: "The time at which the first version of this type was created",
      },
      metadata_updated_at: {
        type: "timestamp with time zone",
        notNull: true,
        comment: "The time at which the shared type metadata was last updated",
      },
      /**
       * Remaining columns are metadata shared across all versions of an entity
       */
      versioned: {
        type: "boolean",
        notNull: true,
        default: true,
        comment: stripNewLines(`
          If true, multiple versions of this type may exist in the \`entity_type_versions\`
          table. For non-versioned types, this column is \`false\` and the type has exactly
          one corresponding row in entity_type_versions
        `),
      },
      extra: {
        type: "jsonb",
      },
      name: {
        type: "text",
        notNull: true,
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.addConstraint("entity_types", "entity_type_unique_constraint", {
    unique: ["account_id", "name"],
  });

  pgm.createTable(
    "entity_type_versions",
    {
      entity_type_version_id: {
        type: "uuid",
        notNull: true,
        primaryKey: true,
      },
      account_id: {
        type: "uuid",
        notNull: true,
        references: {
          name: "accounts",
        },
      },
      entity_type_id: {
        type: "uuid",
        notNull: true,
        references: {
          name: "entity_types",
        },
      },
      properties: {
        type: "jsonb",
        notNull: true,
      },
      updated_by_account_id: {
        type: "uuid",
        notNull: true,
        references: {
          name: "accounts",
        },
      },
      updated_at: {
        type: "timestamp with time zone",
        notNull: true,
        comment: stripNewLines(`
          Versioned types are never mutated, so the updated_at time always matches the
          created_at time. Non-versioned types may be mutatated in-place, and the
          updated_at column changes when a mutation is made.
        `),
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createIndex("entity_type_versions", "entity_type_id", {
    name: "entity_type_versions_entity_type_id",
    ifNotExists: true,
  });

  /**
   * @todo: does this play well with citus?
   * JSONB index for componentIds, this will speed up checking for an entity with a specific componentId property.
   */
  pgm.createIndex(
    "entity_type_versions",
    "((properties ->> 'componentId'::text))",
    {
      name: "entity_type_version_component_id",
      ifNotExists: true,
    },
  );

  /**
   * @todo: Does this play well with citus?
   * JSONB GIN index on allOf field of JSON schema. jsonb_path_ops option on the GIN index optimizes for @> operations.
   * https://www.postgresql.org/docs/9.5/gin-builtin-opclasses.html
   * Used for accessing children of (types that inherit from) an EntityType.
   */
  pgm.createIndex("entity_type_versions", "(properties -> 'allOf')", {
    method: "gin",
    name: "entity_type_versions_prop_allOf",
    ifNotExists: true,
  });

  /**
   * @todo: Does this play well with citus?
   * The $id field of the JSON schema is used to find schemas referred to in other schemas by $ref
   * For example, this is used to find all parent EntityTypes (types this EntityType inherits).
   * The contents of allOf is traversed and matched on the property field '$id'
   */
  pgm.createIndex(
    "entity_type_versions",
    "((properties ->> '$id'::text))", // @todo: ((properties -> 'allOf') jsonb_path_ops)
    {
      name: "entity_type_version_prop_id",
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "entities",
    {
      account_id: {
        type: "uuid",
        notNull: true,
        references: {
          name: "accounts",
        },
        primaryKey: true,
      },
      entity_id: {
        type: "uuid",
        notNull: true,
        comment: "The fixed ID across all versions of an entity",
        primaryKey: true,
      },
      created_by_account_id: {
        type: "uuid",
        notNull: true,
        references: {
          name: "accounts",
        },
        comment: "The account id of the account that created this entity",
      },
      created_at: {
        type: "timestamp with time zone",
        notNull: true,
        comment:
          "The time at which the first version of this entity was created",
      },
      metadata_updated_at: {
        type: "timestamp with time zone",
        notNull: true,
        comment:
          "The time at which the shared entity metadata was last updated",
      },
      /**
       * Remaining columns are metadata shared across all versions of an entity
       */
      versioned: {
        type: "boolean",
        notNull: true,
        comment: stripNewLines(`
          If true, multiple versions of this entity mayexist in the entity_versions table.
          For non-versioned entities, this column is \`false\` and the entity has exactly one
          corresponding row in entity_versions
        `),
      },
      extra: {
        type: "jsonb",
        comment: "Extra context-specific metadata",
      },
    },
    {
      ifNotExists: true,
      comment:
        "The entities table stores metadata which is shared across all versions of an entity.",
    },
  );

  /**
   * Partial index for entities that are "accounts".
   * Index is used in query plan when these entities make up no more than than a significant minority of entities (<10%) in the table.
   */
  pgm.createIndex("entities", ["account_id", "entity_id"], {
    name: "account_entities",
    where: "account_id = entity_id",
    ifNotExists: true,
  });

  pgm.createTable(
    "entity_versions",
    {
      account_id: {
        type: "uuid",
        notNull: true,
        references: {
          name: "accounts",
        },
        primaryKey: true,
      },
      entity_version_id: {
        type: "uuid",
        notNull: true,
        primaryKey: true,
      },
      entity_id: {
        type: "uuid",
        notNull: true,
      },
      entity_type_version_id: {
        type: "uuid",
        notNull: true,
        references: {
          name: "entity_type_versions",
        },
      },
      properties: {
        type: "jsonb",
        notNull: true,
      },
      updated_by_account_id: {
        type: "uuid",
        notNull: true,
        comment:
          "The account id of the account that updated (or created) this entity version",
      },
      updated_at: {
        type: "timestamp with time zone",
        notNull: true,
        comment: stripNewLines(`
          Versioned entities are never mutated, so the updated_at time always matches the
          created_at time. Non-versioned entities may be mutatated in-place, and the
          updated_at column changes when a mutation is made.
        `),
      },
    },
    { ifNotExists: true },
  );

  /**
   * Along with the account_entities index, these make up the partial indices that increase performance when querying for "accounts".
   */
  pgm.createIndex("entity_versions", ["account_id", "entity_id"], {
    name: "account_entity_versions",
    where: "account_id = entity_id",
    ifNotExists: true,
  });

  pgm.createIndex("entity_versions", ["account_id", "entity_id"], {
    name: "entity_versions_entity_id",
    ifNotExists: true,
  });

  pgm.createTable(
    "entity_account",
    {
      entity_version_id: { type: "uuid", notNull: true, primaryKey: true },
      entity_id: { type: "uuid", notNull: true },
      account_id: { type: "uuid", notNull: true },
    },
    {
      ifNotExists: true,
      comment:
        "For entityId : accountId lookups or entityVersionId : accountId lookups",
    },
  );

  pgm.createIndex("entity_account", "entity_id", {
    name: "entity_account_entity_id",
    ifNotExists: true,
  });

  pgm.createTable(
    "links",
    {
      link_id: {
        type: "uuid",
        notNull: true,
        primaryKey: true,
        comment: "The UUID of the link",
      },
      path: {
        type: "text",
        notNull: true,
        comment:
          "The JSON path of the link on the source entity's properties JSON blob",
      },
      source_account_id: {
        type: "uuid",
        notNull: true,
        // included in the primary key so it can be used as a sharding key
        primaryKey: true,
        comment: "The account id of the source entity",
      },
      source_entity_id: {
        type: "uuid",
        notNull: true,
        comment: "The entity id of the source entity.",
      },
      applied_to_source_at: {
        type: "timestamp with time zone",
        notNull: true,
        comment: stripNewLines(`
          The timestamp when the link was applied to the source entity (i.e. when
          it was created)
        `),
      },
      applied_to_source_by_account_id: {
        type: "uuid",
        notNull: true,
        comment: "The account_id of the account which created the link",
      },
      removed_from_source_at: {
        type: "timestamp with time zone",
        notNull: false,
        comment: stripNewLines(`
          The timestamp when the link was removed from the source entity, if at
          all (i.e. when it was deleted)
        `),
      },
      removed_from_source_by_account_id: {
        type: "uuid",
        notNull: false,
        comment: "The account_id of the account which deleted the link",
      },
      destination_account_id: {
        type: "uuid",
        notNull: true,
        comment: "The account id of the destination entity",
      },
      destination_entity_id: {
        type: "uuid",
        notNull: true,
        comment: "The entity id of the destination entity",
      },
      destination_entity_version_id: {
        type: "uuid",
        comment: stripNewLines(`
          The entity version id of a specific version of the link's destination
          entity which is defined only if this link is pinned to a specific version
          of the destination entity. When set to null, the link is to the latest
          version of the destination entity.
        `),
      },
    },
    { ifNotExists: true, comment: "Stores links between entities" },
  );

  pgm.createTable(
    "link_versions",
    {
      source_account_id: {
        type: "uuid",
        notNull: true,
        primaryKey: true,
        comment: "The account id of the source entity",
      },
      link_version_id: {
        type: "uuid",
        notNull: true,
        primaryKey: true,
        comment: "The UUID of the link version",
      },
      link_id: {
        type: "uuid",
        notNull: true,
        comment: "The UUID of the link",
      },
      index: {
        type: "integer",
        notNull: false,
        default: null,
        comment: "The index of the link",
      },
      updated_at: {
        type: "timestamp with time zone",
        notNull: true,
        comment: stripNewLines(`
          Versioned links are never mutated, so the updated_at time represents when
          the version was created. Non-versioned links may be mutatated in-place, and the
          updated_at column changes when a mutation is made.
        `),
      },
      updated_by_account_id: {
        type: "uuid",
        notNull: true,
        comment:
          "The account id of the account that updated (or created) this link version",
      },
    },
    { ifNotExists: true },
  );

  /** @todo: create link table index */

  pgm.createTable(
    "incoming_links",
    {
      destination_account_id: {
        type: "uuid",
        notNull: true,
        primaryKey: true,
      },
      destination_entity_id: {
        type: "uuid",
        notNull: true,
        primaryKey: true,
      },
      source_account_id: {
        type: "uuid",
        notNull: true,
        primaryKey: true,
      },
      link_id: {
        type: "uuid",
        notNull: true,
        primaryKey: true,
      },
    },
    {
      ifNotExists: true,
      comment:
        "Stores reverse child --> parent link references for looking up the incoming links for a given entity",
    },
  );

  pgm.createTable(
    "aggregations",
    {
      source_account_id: {
        type: "uuid",
        notNull: true,
        // included in the primary key so it can be used as a sharding key
        primaryKey: true,
        comment: "The account id of the source entity",
      },
      source_entity_id: {
        type: "uuid",
        notNull: true,
        primaryKey: true,
        comment: "The entity id of the source entity.",
      },
      path: {
        type: "text",
        notNull: true,
        primaryKey: true,
        comment:
          "The JSON path of the aggregation on the source entity's properties JSON blob",
      },
      source_entity_version_ids: {
        type: "uuid[]",
        notNull: true,
        primaryKey: true,
        comment: stripNewLines(`
          The entity version ids of the source entity's versions where
          this aggregation exists.
        `),
      },
      operation: {
        type: "jsonb",
        notNull: true,
        comment: "The aggregation operation",
      },
      created_by_account_id: {
        type: "uuid",
        notNull: true,
        comment: "The account that created this aggregation",
      },
      created_at: {
        type: "timestamp with time zone",
        notNull: true,
        comment: "The time at which the first version of this type was created",
      },
    },
    {
      ifNotExists: true,
      comment: "Stores aggregations of entities",
    },
  );

  pgm.createTable(
    "verification_codes",
    {
      verification_id: { type: "uuid", notNull: true },
      account_id: { type: "uuid", notNull: true },
      user_id: { type: "uuid", notNull: true },
      verification_code: { type: "text", notNull: true },
      email_address: { type: "text", notNull: true },
      used: { type: "boolean", notNull: true, default: false },
      number_of_attempts: { type: "integer", notNull: true, default: 0 },
      created_at: { type: "timestamp with time zone", notNull: true },
    },
    {
      ifNotExists: true,
      comment:
        "Stores verification codes used for passwordless authentication and email verification",
    },
  );

  pgm.createTable(
    "session",
    {
      sid: {
        type: "text",
        primaryKey: true,
      },
      sess: {
        type: "jsonb",
        notNull: true,
      },
      expire: {
        type: "timestamp with time zone",
        notNull: true,
      },
    },
    {
      ifNotExists: true,
      comment: stripNewLines(`
        \`connect-db-simple\` express session store (based on \`node_modules/connect-pg-simple/table.sql\`)

        Note: column names cannot be modified, the table name can be modified but must also be passed
        to \`connect-db-simple\` as a parameter in \`src/auth/session.ts\`
      `),
    },
  );

  pgm.createIndex("session", "expire", {
    name: "session_expire",
    ifNotExists: true,
  });

  pgm.createSchema("realtime", { ifNotExists: true });

  pgm.createTable(
    { schema: "realtime", name: "ownership" },
    {
      slot_name: { type: "text", primaryKey: true },
      slot_owner: { type: "uuid", notNull: true },
      ownership_expires_at: { type: "timestamp with time zone" },
    },
    { ifNotExists: true },
  );
}

/** Rolling back would cause data loss, as tables would be destroyed. */
export const down = false;
