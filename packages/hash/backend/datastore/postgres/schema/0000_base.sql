create table if not exists accounts (
    account_id uuid primary key
);


create table if not exists entity_types (
    /**
      The entity_types table does not include account_id in its primary key, unlike others:
        some types have to be shared access across all accounts, and for performance reasons
        we do not want to shard the entity_types table by account_id.
    */
    entity_type_id  uuid not null primary key,

    account_id      uuid not null references accounts (account_id) deferrable,
    name            text not null,
    versioned       boolean not null default true,
    extra           jsonb,

    created_by      uuid not null, -- todo add references accounts (account_id)
    created_at      timestamp with time zone not null,
    updated_at      timestamp with time zone not null,

    unique(account_id, name)
);
-- select create_reference_table('entity_types')

create table if not exists entity_type_versions (
    entity_type_version_id  uuid not null primary key,

    account_id              uuid not null references accounts (account_id),
    entity_type_id          uuid not null references entity_types (entity_type_id),
    properties              jsonb not null,

    created_by              uuid not null, -- todo add: references accounts (account_id)
    created_at              timestamp with time zone not null,
    updated_at              timestamp with time zone not null
);
-- select create_reference_table('entity_type_versions')

/**
The entities table stores metadata which is shared across all versions of an entity.
*/
create table if not exists entities (
    account_id  uuid not null,
    entity_id   uuid not null,
    versioned   boolean not null,
    extra       jsonb,

    primary key (account_id, entity_id)
);


create table if not exists entity_versions (
    account_id              uuid not null references accounts (account_id),
    entity_version_id       uuid not null,
    entity_id               uuid not null,
    entity_type_version_id  uuid not null references entity_type_versions (entity_type_version_id),

    properties              jsonb not null,
    created_by              uuid not null,
    created_at              timestamp with time zone not null,
    updated_at              timestamp with time zone not null,

    foreign key (account_id, entity_id) references entities (account_id, entity_id) deferrable,

    primary key (account_id, entity_version_id)
);
create index if not exists entity_versions_entity_id on entity_versions (account_id, entity_id);


/** For entity ID : account ID lookups */
create table if not exists entity_account (
    entity_version_id  uuid not null primary key,
    account_id         uuid not null,

    foreign key (account_id, entity_version_id) references
      entity_versions (account_id, entity_version_id) deferrable
);


/** Stores parent --> child link references */
create table if not exists outgoing_links (
    account_id        uuid not null,
    entity_version_id uuid not null,
    child_account_id  uuid not null,
    child_version_id  uuid not null,

    foreign key (account_id, entity_version_id) references
      entity_versions (account_id, entity_version_id) deferrable,

    foreign key (child_account_id, child_version_id)
      references entity_versions (account_id, entity_version_id) deferrable,

    primary key (account_id, entity_version_id, child_version_id)
);


/** Stores reverse child --> parent link references */
create table if not exists incoming_links (
    account_id        uuid not null,
    entity_version_id uuid not null,
    parent_account_id uuid not null,
    parent_version_id uuid not null,

    foreign key (account_id, entity_version_id) references
      entity_versions (account_id, entity_version_id) deferrable,

    foreign key (parent_account_id, parent_version_id) references
      entity_versions (account_id, entity_version_id) deferrable,

    primary key (account_id, entity_version_id, parent_version_id)
);

/** Stores login codes used for passwordless authentication */
create table if not exists login_codes (
    login_id           uuid not null,
    account_id         uuid not null,
    user_id            uuid not null,
    login_code         text not null,
    number_of_attempts integer not null default 0,
    created_at         timestamp with time zone not null,

    foreign key (account_id, user_id) references entity_versions (account_id, entity_version_id)
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
