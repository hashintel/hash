CREATE TABLE entity_ids (
    web_id UUID NOT NULL REFERENCES web,
    entity_uuid UUID NOT NULL,
    provenance JSONB NOT NULL,
    read_only BOOLEAN NOT NULL,
    created_by_id UUID,
    created_at_transaction_time TIMESTAMP WITH TIME ZONE,
    created_at_decision_time TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (web_id, entity_uuid)
);

CREATE TABLE entity_drafts (
    web_id UUID NOT NULL,
    entity_uuid UUID NOT NULL,
    draft_id UUID PRIMARY KEY,
    FOREIGN KEY (web_id, entity_uuid) REFERENCES entity_ids
);

CREATE TABLE entity_editions (
    entity_edition_id UUID NOT NULL PRIMARY KEY,
    properties JSONB NOT NULL,
    property_metadata JSONB,
    archived BOOLEAN NOT NULL,
    provenance JSONB NOT NULL,
    confidence DOUBLE PRECISION,
    created_by_id UUID
);

-- Denormalized per-edition cache of the sorting/filtering aggregates, rebuildable at
-- any time via `reindex_entity_cache`. The four type-derived arrays are positionally
-- aligned and cover ALL inheritance depths (type containment checks match supertypes),
-- ordered by (inheritance depth, title, base URL, version DESC) — the direct types form
-- the prefix of length `direct_types`, and `[1]` is the canonically first direct type.
-- `versions` carries the numeric versions for consumers needing base URL and version
-- separately (e.g. HashQL).
-- `labels` is resolved per direct type (label inheritance lives in each type's
-- `closed_schema.allOf`), ordered by (title, base URL, version DESC); `labels[1]` is
-- the display/sort label, NULL when the entity has none. Descending sorts reuse the
-- same element — no min/max flip.
CREATE TABLE entity_edition_cache (
    entity_edition_id UUID PRIMARY KEY REFERENCES entity_editions ON DELETE CASCADE,
    direct_types INT NOT NULL,
    labels TEXT [],
    type_titles TEXT [] NOT NULL,
    base_urls TEXT [] NOT NULL,
    versions BIGINT [] NOT NULL,
    versioned_urls TEXT [] NOT NULL
);

-- Type filters arrive as containment checks (`@>`); labels/titles are only sorted or
-- projected, never filtered, so they carry no index.
CREATE INDEX entity_edition_cache_base_urls ON entity_edition_cache USING gin (base_urls);
CREATE INDEX entity_edition_cache_versioned_urls ON entity_edition_cache USING gin (
    versioned_urls
);

CREATE TABLE entity_temporal_metadata (
    web_id UUID NOT NULL,
    entity_uuid UUID NOT NULL,
    draft_id UUID REFERENCES entity_drafts (draft_id),
    entity_edition_id UUID NOT NULL REFERENCES entity_editions,
    decision_time TSTZRANGE NOT NULL,
    transaction_time TSTZRANGE NOT NULL,
    FOREIGN KEY (web_id, entity_uuid) REFERENCES entity_ids,
    CONSTRAINT entity_temporal_metadata_overlapping EXCLUDE USING gist (
        web_id WITH =,
        entity_uuid WITH =,
        decision_time WITH &&,
        transaction_time WITH &&
    ) WHERE (draft_id IS NULL),
    CONSTRAINT entity_temporal_metadata_overlapping_draft EXCLUDE USING gist (
        web_id WITH =,
        entity_uuid WITH =,
        draft_id WITH =,
        decision_time WITH &&,
        transaction_time WITH &&
    ) WHERE (draft_id IS NOT NULL),
    CHECK (lower(decision_time) <= lower(transaction_time))
);

CREATE INDEX entity_temporal_metadata_temporal_idx
ON entity_temporal_metadata
USING gist (web_id, entity_uuid, transaction_time, decision_time);
CREATE INDEX entity_temporal_metadata_edition_id_idx
ON entity_temporal_metadata (entity_edition_id);

CREATE TABLE entity_is_of_type (
    entity_edition_id UUID NOT NULL REFERENCES entity_editions,
    entity_type_ontology_id UUID NOT NULL REFERENCES entity_types,
    inheritance_depth INT NOT NULL,
    PRIMARY KEY (entity_edition_id, entity_type_ontology_id)
);

-- The primary key leads with `entity_edition_id` (the "edition -> types" direction used by
-- cache builds), so type-filtered lookups cannot use it and fall back to a full scan. This
-- index leads with the type to make those lookups index-driven, with `entity_edition_id`
-- trailing to cover the join back to editions.
CREATE INDEX entity_is_of_type_type_lookup
ON entity_is_of_type (entity_type_ontology_id, entity_edition_id);

CREATE TYPE entity_edge_kind AS ENUM ('has-left-entity', 'has-right-entity');
CREATE TYPE edge_direction AS ENUM ('outgoing', 'incoming');

-- Unified edge table storing all entity relationships
CREATE TABLE entity_edge (
    source_web_id UUID NOT NULL,
    source_entity_uuid UUID NOT NULL,
    target_web_id UUID NOT NULL,
    target_entity_uuid UUID NOT NULL,
    kind ENTITY_EDGE_KIND NOT NULL,
    direction EDGE_DIRECTION NOT NULL,
    provenance JSONB,
    confidence DOUBLE PRECISION,
    FOREIGN KEY (source_web_id, source_entity_uuid) REFERENCES entity_ids,
    FOREIGN KEY (target_web_id, target_entity_uuid) REFERENCES entity_ids,
    UNIQUE (source_web_id, source_entity_uuid, kind, direction, target_web_id, target_entity_uuid)
);

CREATE INDEX entity_edge_forward_idx
ON entity_edge (source_web_id, source_entity_uuid, kind, direction);
CREATE INDEX entity_edge_backward_idx
ON entity_edge (target_web_id, target_entity_uuid, kind, direction);

CREATE VIEW entity_has_left_entity AS
SELECT
    entity_edge.source_web_id AS web_id,
    entity_edge.source_entity_uuid AS entity_uuid,
    entity_edge.target_web_id AS left_web_id,
    entity_edge.target_entity_uuid AS left_entity_uuid,
    entity_edge.provenance,
    entity_edge.confidence
FROM entity_edge
WHERE entity_edge.kind = 'has-left-entity' AND entity_edge.direction = 'outgoing';

CREATE VIEW entity_has_right_entity AS
SELECT
    entity_edge.source_web_id AS web_id,
    entity_edge.source_entity_uuid AS entity_uuid,
    entity_edge.target_web_id AS right_web_id,
    entity_edge.target_entity_uuid AS right_entity_uuid,
    entity_edge.provenance,
    entity_edge.confidence
FROM entity_edge
WHERE entity_edge.kind = 'has-right-entity' AND entity_edge.direction = 'outgoing';

CREATE TABLE entity_embeddings (
    web_id UUID NOT NULL,
    entity_uuid UUID NOT NULL,
    draft_id UUID REFERENCES entity_drafts (draft_id),
    property TEXT REFERENCES base_urls,
    embedding VECTOR(3072) NOT NULL,
    updated_at_decision_time TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at_transaction_time TIMESTAMP WITH TIME ZONE NOT NULL,
    FOREIGN KEY (web_id, entity_uuid) REFERENCES entity_ids
);

CREATE UNIQUE INDEX entity_embeddings_idx
ON entity_embeddings (web_id, entity_uuid, property) NULLS NOT DISTINCT;
