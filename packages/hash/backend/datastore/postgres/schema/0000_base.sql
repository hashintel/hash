create table if not exists entity_types (
    id         serial primary key,
    name       text not null unique
);

-- create table if not exists link_types (
--     id         serial primary key,
--     name       text not null unique
-- );

create table if not exists shards (
    shard_id uuid primary key
);

create table if not exists entities (
    shard_id   uuid not null references shards (shard_id),
    id         uuid not null,
    type       integer not null references entity_types (id),
    properties jsonb not null,
    created_by uuid not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,

    primary key(shard_id, id)
);

/*
This table is used to lookup the shard an entity belongs to.
*/
create table if not exists entity_shard (
    entity_id uuid not null primary key,
    shard_id  uuid not null,

    foreign key (shard_id, entity_id) references entities (shard_id, id)
);

create table if not exists outgoing_links (
    shard_id       uuid not null,
    entity_id      uuid not null,
    child_shard_id uuid not null,
    child_id       uuid not null,

    foreign key (shard_id, entity_id) references entities (shard_id, id),
    foreign key (child_shard_id, child_id) references entities (shard_id, id),

    primary key (shard_id, entity_id, child_id)
);

create table if not exists incoming_links (
    shard_id        uuid not null,
    entity_id       uuid not null,
    parent_shard_id uuid not null,
    parent_id       uuid not null,

    foreign key (shard_id, entity_id) references entities (shard_id, id),
    foreign key (parent_shard_id, parent_id) references entities (shard_id, id),

    primary key (shard_id, entity_id, parent_id)
);


-- create table if not exists links (
--     shard_id   uuid not null references shards (shard_id),
--     src_id     uuid not null,
--     dst_id     uuid not null,
--     -- type       integer not null references link_types (id),
--     -- properties jsonb,
--     -- created_at timestamp with time zone not null,
--     -- updated_at timestamp with time zone not null,

--     foreign key (shard_id, src_id) references entities (shard_id, id),
--     foreign key (shard_id, dst_id) references entities (shard_id, id),

--     -- This index optimizes queries for parent -> child relationships.
--     primary key(shard_id, src_id, dst_id)
-- );

-- -- This index optimizes for child -> parent relationships.
-- create unique index if not exists links_shard_dst_src on links (shard_id, dst_id, src_id);
