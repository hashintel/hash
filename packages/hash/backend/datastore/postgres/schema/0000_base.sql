create table if not exists entity_types (
    id         serial primary key,
    name       text not null unique
);


create table if not exists shards (
    shard_id uuid primary key
);


/**
The entity_metadata table stores metadata which is shared across all versions of an
entity.
*/
create table if not exists entity_metadata (
    shard_id    uuid not null,
    metadata_id uuid not null,
    extra       jsonb,

    primary key (shard_id, metadata_id)
);


create table if not exists entities (
    shard_id    uuid not null references shards (shard_id),
    id          uuid not null,
    type        integer not null references entity_types (id),
    properties  jsonb not null,
    history_id  uuid,
    metadata_id uuid not null,
    created_by  uuid not null,
    created_at  timestamp with time zone not null,
    updated_at  timestamp with time zone not null,

    foreign key (shard_id, metadata_id) references entity_metadata (shard_id, metadata_id),

    -- TODO: FK on history_id

    primary key(shard_id, id)
);


create table if not exists entity_history (
    shard_id   uuid not null,
    history_id uuid not null,
    entity_id  uuid not null,

    -- This is the time the corresponding entity was created, not the time this row
    -- was inserted.
    created_at timestamp with time zone not null,

    foreign key (shard_id, entity_id) references entities (shard_id, id),

    primary key(shard_id, history_id)
);


/** For entity ID : shard ID lookups */
create table if not exists entity_shard (
    entity_id uuid not null primary key,
    shard_id  uuid not null,

    foreign key (shard_id, entity_id) references entities (shard_id, id)
);


/** Stores parent --> child link references */
create table if not exists outgoing_links (
    shard_id       uuid not null,
    entity_id      uuid not null,
    child_shard_id uuid not null,
    child_id       uuid not null,

    foreign key (shard_id, entity_id) references entities (shard_id, id),
    foreign key (child_shard_id, child_id) references entities (shard_id, id),

    primary key (shard_id, entity_id, child_id)
);


/** Stores reverse child --> parent link references */
create table if not exists incoming_links (
    shard_id        uuid not null,
    entity_id       uuid not null,
    parent_shard_id uuid not null,
    parent_id       uuid not null,

    foreign key (shard_id, entity_id) references entities (shard_id, id),
    foreign key (parent_shard_id, parent_id) references entities (shard_id, id),

    primary key (shard_id, entity_id, parent_id)
);