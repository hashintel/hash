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
    account_id    uuid not null,
    metadata_id uuid not null,
    extra       jsonb,

    primary key (account_id, metadata_id)
);


create table if not exists entities (
    account_id  uuid not null references accounts (account_id),
    id          uuid not null,
    type        integer not null references entity_types (id),
    properties  jsonb not null,
    history_id  uuid,
    metadata_id uuid not null,
    created_by  uuid not null,
    created_at  timestamp with time zone not null,
    updated_at  timestamp with time zone not null,

    foreign key (account_id, metadata_id) references entity_metadata (account_id, metadata_id),

    primary key(account_id, id)
);
create index if not exists entities_history on entities (account_id, history_id);


/** For entity ID : shard ID lookups */
create table if not exists entity_shard (
    entity_id  uuid not null primary key,
    account_id uuid not null,

    foreign key (account_id, entity_id) references entities (account_id, id)
);


/** Stores parent --> child link references */
create table if not exists outgoing_links (
    account_id       uuid not null,
    entity_id        uuid not null,
    child_account_id uuid not null,
    child_id         uuid not null,

    foreign key (account_id, entity_id) references entities (account_id, id),
    foreign key (child_account_id, child_id) references entities (account_id, id),

    primary key (account_id, entity_id, child_id)
);


/** Stores reverse child --> parent link references */
create table if not exists incoming_links (
    account_id        uuid not null,
    entity_id         uuid not null,
    parent_account_id uuid not null,
    parent_id         uuid not null,

    foreign key (account_id, entity_id) references entities (account_id, id),
    foreign key (parent_account_id, parent_id) references entities (account_id, id),

    primary key (account_id, entity_id, parent_id)
);