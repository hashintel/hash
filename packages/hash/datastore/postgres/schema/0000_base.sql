create table if not exists accounts (
    account_id uuid primary key
);


/** The entity_types table does not include account_id in its primary key, some types
are shared access across all accounts, and for performance reasons we do not want
to shard the entity_types table by account_id.*/
create table if not exists entity_types (
    -- The fixed ID across all versions of an entity type
    entity_type_id         uuid not null primary key,

    account_id             uuid not null references accounts (account_id) deferrable,
    created_by_account_id  uuid not null, -- todo add references accounts (account_id)

    -- The time at which the first version of this type was created
    created_at             timestamp with time zone not null,

    -- The time at which the shared type metadata was last updated
    metadata_updated_at    timestamp with time zone not null,

    /**
    * Remaining columns are metadata shared across all versions of an entity
    */

    -- If true, multiple versions of this type may exist in the entity_type_versions
    -- table. For non-versioned types, this column is `false` and the type has exactly
    -- one corresponding row in entity_type_versions
    versioned              boolean not null default true,

    extra                  jsonb,
    name                   text not null,

    unique(account_id, name)
);

create table if not exists entity_type_versions (
    entity_type_version_id  uuid not null primary key,
    account_id              uuid not null references accounts (account_id),
    entity_type_id          uuid not null references entity_types (entity_type_id),
    properties              jsonb not null,

    updated_by_account_id              uuid not null, -- todo add: references accounts (account_id)

    -- Versioned types are never mutated, so the updated_at time always matches the
    -- created_at time. Non-versioned types may be mutatated in-place, and the
    -- updated_at column changes when a mutation is made.
    updated_at              timestamp with time zone not null
);
create index if not exists entity_type_versions_entity_type_id on entity_type_versions (entity_type_id);

-- @todo: Does this play well with citus? 
-- JSONB index for componentIds, this will speed up checking for an entity with a specific componentId property.
create index if not exists entity_type_version_component_id ON entity_type_versions ((properties ->> 'componentId'::text));

-- @todo: Does this play well with citus? 
-- JSOB GIN index on allOf field of JSON schema. jsonb_path_ops option on the GIN index optimizes for @> operations.
-- https://www.postgresql.org/docs/9.5/gin-builtin-opclasses.html
-- Used for accessing children of (types that inherit from) an EntityType.
create index if not exists entity_type_versions_prop_allOf on entity_type_versions using gin ((properties -> 'allOf') jsonb_path_ops);

-- @todo: Does this play well with citus? 
-- The $id field of the JSON schema is used to find schemas referred to in other schemas by $ref
-- For example, this is used to find all parent EntityTypes (types this EntityType inherits).
-- The contents of allOf is traversed and matched on the property field '$id'
create index if not exists entity_type_version_prop_id ON entity_type_versions ((properties ->> '$id'::text));

/**
The entities table stores metadata which is shared across all versions of an entity.
*/
create table if not exists entities (
    account_id           uuid not null,

    -- The fixed ID across all versions of an entity
    entity_id            uuid not null,

    -- The time at which the first version of this entity was created
    created_at           timestamp with time zone not null,

    -- The account id of the account that created this entity
    created_by_account_id           uuid not null,

    -- The time at which the shared entity metadata was last updated
    metadata_updated_at  timestamp with time zone not null,

    /**
    * Remaining columns are metadata shared across all versions of an entity
    */

    -- If true, multiple versions of this entity may exist in the entity_versions table.
    -- For non-versioned entities, this column is `false` and the entity has exactly one
    -- corresponding row in entity_versions
    versioned            boolean not null,

    -- Extra context-specific metadata
    extra                jsonb,

    primary key (account_id, entity_id)
);

-- Partial index for entities that are "accounts".
-- Index is used in query plan when these entities make up no more than than a significant minority of entities (<10%) in the table.
create index if not exists account_entities on entities (account_id, entity_id) where account_id = entity_id;

create table if not exists entity_versions (
    account_id              uuid not null references accounts (account_id),
    entity_version_id       uuid not null,
    entity_id               uuid not null,
    entity_type_version_id  uuid not null references entity_type_versions (entity_type_version_id),

    properties              jsonb not null,

    -- The account id of the account that updated (or created) this entity version
    updated_by_account_id   uuid not null,

    -- Versioned entities are never mutated, so the updated_at time always matches the
    -- created_at time. Non-versioned entities may be mutatated in-place, and the
    -- updated_at column changes when a mutation is made.';
    updated_at              timestamp with time zone not null,

    primary key (account_id, entity_version_id)
);

-- Along with the account_entities index, these make up the partial indices that increase performance when querying for "accounts".
create index if not exists account_entity_versions on entity_versions (account_id, entity_id) where account_id = entity_id;

create index if not exists entity_versions_entity_id on entity_versions (account_id, entity_id);

/** For entityId : accountId lookups or entityVersionId : accountId lookups */
create table if not exists entity_account (
    entity_version_id  uuid not null primary key,
    entity_id          uuid not null,
    account_id         uuid not null
);
create index if not exists entity_account_entity_id on entity_account (entity_id);

/** Stores links between entities */
create table if not exists links (
    -- The UUID of the link
    link_id                            uuid not null,
    -- The JSON path of the link on the source entity's properties JSON blob
    path                               text not null,
    -- The account id of the source entity
    source_account_id                  uuid not null,
    -- The entity id of the source entity.
    source_entity_id                   uuid not null,
    -- The timestamp when the link was applied to the source entity (i.e. when
    -- it was created)
    applied_to_source_at               timestamp with time zone not null,
    -- the account_id of the account which created the link
    applied_to_source_by_account_id    uuid not null,
    -- The timestamp when the link was removed from the source entity, if at
    -- all (i.e. when it was deleted)
    removed_from_source_at             timestamp with time zone,
    -- the account_id of the account which deleted the link
    removed_from_source_by_account_id  uuid,
    -- The account id of the destination entity
    destination_account_id             uuid not null,
    -- The entity id of the destination entity
    destination_entity_id              uuid not null,
    -- The entity version id of a specific version of the link's destination
    -- entity which is defined only if this link is pinned to a specific version
    -- of the destination entity. When set to null, the link is to the latest
    -- version of the destination entity.
    destination_entity_version_id      uuid,

    constraint links_pk primary key (
      source_account_id, -- included in the primary key so it can be used as a sharding key
      link_id
    )
);


create table if not exists link_versions (
    -- The account id of the source entity
    source_account_id        uuid not null,
    -- The UUID of the link version
    link_version_id          uuid not null,
    -- The UUID of the link
    link_id                  uuid not null,
    -- The index of the link
    index                    integer default null,
    -- Versioned links are never mutated, so the updated_at time represents when
    -- the version was created. Non-versioned links may be mutatated in-place, and the
    -- updated_at column changes when a mutation is made.
    updated_at               timestamp with time zone not null,
    -- The account id of the account that updated (or created) this link version
    updated_by_account_id    uuid not null,

    primary key (source_account_id, link_version_id)
);

/** @todo: create link table index */

/** Stores reverse child --> parent link references for looking up the incoming links for a given entity */
create table if not exists incoming_links (
    destination_account_id      uuid not null,
    destination_entity_id       uuid not null,
    source_account_id           uuid not null,
    link_id                     uuid not null,

    constraint incoming_links_pk primary key (
      destination_account_id, -- included in the primary key so it can be used as a sharding key
      destination_entity_id,
      link_id
    )
);

/** Stores aggregations of entities */
create table if not exists aggregations (
    -- The account id of the source entity
    source_account_id             uuid not null,
    -- The entity id of the source entity.
    source_entity_id              uuid not null,
    -- The JSON path of the aggregation on the source entity's properties JSON blob
    path                          text not null,
    -- The entity version ids of the source entity's versions where
    -- this aggregation exists.
    source_entity_version_ids     uuid[] not null,
    -- The aggregation operation
    operation                     jsonb not null,
    -- The account that created this aggregation
    created_by_account_id         uuid not null,
    -- The time at which the first version of this type was created
    created_at                    timestamp with time zone not null,

    constraint aggregations_pk primary key (
      source_account_id, -- included in the primary key so it can be used as a sharding key
      source_entity_id,
      path,
			source_entity_version_ids
    )
);

/** Stores verification codes used for passwordless authentication and email verification */
create table if not exists verification_codes (
    verification_id    uuid not null,
    account_id         uuid not null,
    user_id            uuid not null,
    verification_code  text not null,
    email_address      text not null,
    used               boolean not null default false,
    number_of_attempts integer not null default 0,
    created_at         timestamp with time zone not null
);

/**
  `connect-db-simple` express session store (based on `node_modules/connect-pg-simple/table.sql`)

  Note: column names cannot be modified, the table name can be modified but must also be passed
  to `connect-db-simple` as a parameter in `src/auth/session.ts`
*/
create table if not exists "session" (
  sid    text primary key,
	sess   jsonb not null,
	expire timestamp with time zone not null
);

create index if not exists session_expire on session (expire);


create schema if not exists realtime;

create table if not exists realtime.ownership (
  slot_name            text primary key,
  slot_owner           uuid not null,
  ownership_expires_at timestamp with time zone
);
