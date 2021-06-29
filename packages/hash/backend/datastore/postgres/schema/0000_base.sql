create table if not exists entity_types (
    id         integer primary key,
    name       text not null unique,
    created_at timestamp with time zone not null default now()
);

create table if not exists link_types (
    id         integer primary key,
    name       text not null unique,
    created_at timestamp with time zone not null default now()
);

create table shards (
    shard_id uuid primary key
);

create table if not exists entities (
    shard_id   uuid not null references shards (shard_id),
    id         uuid not null,
    type       integer not null references entity_types (id),
    properties jsonb not null,
    created_at timestamp with time zone not null,

    primary key(shard_id, id)
);

create table if not exists links (
    shard_id   uuid not null references shards (shard_id),
    src_id     uuid not null,
    dst_id     uuid not null,
    type       integer not null references link_types (id),
    properties jsonb,
    created_at timestamp with time zone not null,

    foreign key (shard_id, src_id) references entities (shard_id, id),
    foreign key (shard_id, dst_id) references entities (shard_id, id),

    -- This index optimizes queries for parent -> child relationships.
    primary key(shard_id, src_id, dst_id)
);

-- This index optimizes for child -> parent relationships.
create unique index if not exists links_shard_dst_src on links (shard_id, dst_id, src_id);
