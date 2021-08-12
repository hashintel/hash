create table if not exists entity_types (
    id         serial primary key,
    name       text not null unique
);


create table if not exists accounts (
    account_id uuid primary key
);


/**
The entity_metadata table stores metadata which is shared across all versions of an
entity.
*/
create table if not exists entity_metadata (
    account_id  uuid not null,
    metadata_id uuid not null,
    versioned   boolean not null,
    extra       jsonb,

    primary key (account_id, metadata_id)
);


create table if not exists entities (
    account_id  uuid not null references accounts (account_id),
    entity_id   uuid not null,
    type        integer not null references entity_types (id),
    properties  jsonb not null,
    metadata_id uuid not null,
    created_by  uuid not null,
    created_at  timestamp with time zone not null,
    updated_at  timestamp with time zone not null,

    foreign key (account_id, metadata_id) references entity_metadata (account_id, metadata_id) deferrable,

    primary key (account_id, entity_id)
);
create index if not exists entities_metadata on entities (account_id, metadata_id);


/** For entity ID : account ID lookups */
create table if not exists entity_account (
    entity_id  uuid not null primary key,
    account_id uuid not null,

    foreign key (account_id, entity_id) references entities (account_id, entity_id) deferrable
);


/** Stores parent --> child link references */
create table if not exists outgoing_links (
    account_id       uuid not null,
    entity_id        uuid not null,
    child_account_id uuid not null,
    child_id         uuid not null,

    foreign key (account_id, entity_id) references entities (account_id, entity_id) deferrable,
    foreign key (child_account_id, child_id) references entities (account_id, entity_id) deferrable,

    primary key (account_id, entity_id, child_id)
);


/** Stores reverse child --> parent link references */
create table if not exists incoming_links (
    account_id        uuid not null,
    entity_id         uuid not null,
    parent_account_id uuid not null,
    parent_id         uuid not null,

    foreign key (account_id, entity_id) references entities (account_id, entity_id) deferrable,
    foreign key (parent_account_id, parent_id) references entities (account_id, entity_id) deferrable,

    primary key (account_id, entity_id, parent_id)
);

/** Stores login codes used for passwordless authentication */
create table if not exists login_codes (
    login_id           uuid not null,
    account_id         uuid not null,
    user_id            uuid not null,
    login_code         text not null,
    number_of_attempts integer not null default 0,
    created_at         timestamp with time zone not null,

    foreign key (account_id, user_id) references entities (account_id, entity_id)
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
