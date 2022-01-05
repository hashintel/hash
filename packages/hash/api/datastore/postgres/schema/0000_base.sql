create table if not exists accounts (
    account_id uuid primary key
);


/** The entity_types table does not include account_id in its primary key, some types
are shared access across all accounts, and for performance reasons we do not want
to shard the entity_types table by account_id.*/
create table if not exists entity_types (
    -- The fixed ID across all versions of an entity type
    entity_type_id       uuid not null primary key,

    account_id           uuid not null references accounts (account_id) deferrable,
    created_by           uuid not null, -- todo add references accounts (account_id)

    -- The time at which the first version of this type was created
    created_at           timestamp with time zone not null,

    -- The time at which the shared type metadata was last updated
    metadata_updated_at  timestamp with time zone not null,

    /**
    * Remaining columns are metadata shared across all versions of an entity
    */

    -- If true, multiple versions of this type may exist in the entity_type_versions
    -- table. For non-versioned types, this column is `false` and the type has exactly
    -- one corresponding row in entity_type_versions
    versioned            boolean not null default true,

    extra                jsonb,
    name                 text not null,

    unique(account_id, name)
);

create table if not exists entity_type_versions (
    entity_type_version_id  uuid not null primary key,
    account_id              uuid not null references accounts (account_id),
    entity_type_id          uuid not null references entity_types (entity_type_id),
    properties              jsonb not null,

    updated_by              uuid not null, -- todo add: references accounts (account_id)

    -- Versioned types are never mutated, so the updated_at time always matches the
    -- created_at time. Non-versioned types may be mutatated in-place, and the
    -- updated_at column changes when a mutation is made.';
    updated_at              timestamp with time zone not null
);
create index if not exists entity_type_versions_entity_type_id on entity_type_versions (entity_type_id);

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
    created_by           uuid not null,

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


create table if not exists entity_versions (
    account_id              uuid not null references accounts (account_id),
    entity_version_id       uuid not null,
    entity_id               uuid not null,
    entity_type_version_id  uuid not null references entity_type_versions (entity_type_version_id),

    properties              jsonb not null,

    -- The account id of the account that updated (or created) this entity version
    updated_by              uuid not null,

    -- Versioned entities are never mutated, so the updated_at time always matches the
    -- created_at time. Non-versioned entities may be mutatated in-place, and the
    -- updated_at column changes when a mutation is made.';
    updated_at              timestamp with time zone not null,

    primary key (account_id, entity_version_id)
);

create index if not exists entity_versions_entity_id on entity_versions (account_id, entity_id);

/** For entityId : accountId lookups or entityVersionId : accountId lookups */
create table if not exists entity_account (
    entity_version_id  uuid not null primary key,
    entity_id          uuid not null,
    account_id         uuid not null
);
create index if not exists entity_account_entity_id on entity_account (entity_id);


/** Stores parent --> child link references */
create table if not exists outgoing_links (
    source_account_id              uuid not null,
    source_entity_id               uuid not null,
    destination_account_id         uuid not null,
    destination_entity_id          uuid not null,
    -- destination_entity_version_id is part of the primary key, which means it cannot be null,
    -- so we just set it to the zero UUID. We're not currently using outgoing_links for
    -- anything, but when we do, we will need to be aware of this.
    destination_entity_version_id  uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
    source_entity_version_ids      uuid[] not null,

    constraint outgoing_links_pk primary key (
      source_account_id, source_entity_id, destination_entity_id, destination_entity_version_id
    )
);


/** Stores reverse child --> parent link references */
create table if not exists incoming_links (
    destination_account_id              uuid not null,
    destination_entity_id               uuid not null,
    source_account_id              uuid not null,
    source_entity_id               uuid not null,

    constraint incoming_links_pk primary key (
      destination_account_id, destination_entity_id, source_entity_id
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
