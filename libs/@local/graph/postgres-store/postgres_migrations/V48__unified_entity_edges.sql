-- Create unified entity edges table
-- This replaces entity_has_left_entity and entity_has_right_entity with a single table
-- that includes kind and direction, eliminating the need for UNION ALL in queries.

-- Create enum types for edge kind and direction
CREATE TYPE entity_edge_kind AS ENUM ('has-left-entity', 'has-right-entity');
CREATE TYPE edge_direction AS ENUM ('outgoing', 'incoming');

-- Create unified edge table
CREATE TABLE entity_edge (
    -- Source entity (the link entity for outgoing, or target entity for incoming)
    source_web_id UUID NOT NULL,
    source_entity_uuid UUID NOT NULL,

    -- Target entity (the referenced entity for outgoing, or link entity for incoming)
    target_web_id UUID NOT NULL,
    target_entity_uuid UUID NOT NULL,

    -- Edge metadata
    kind entity_edge_kind NOT NULL,
    direction edge_direction NOT NULL,

    -- Original metadata from old tables
    provenance JSONB,
    confidence DOUBLE PRECISION,

    FOREIGN KEY (source_web_id, source_entity_uuid) REFERENCES entity_ids,
    FOREIGN KEY (target_web_id, target_entity_uuid) REFERENCES entity_ids,
    UNIQUE (source_web_id, source_entity_uuid, kind, direction, target_web_id, target_entity_uuid)
);

-- Create indexes for efficient traversal
-- Forward index: for traversing from source to target
CREATE INDEX entity_edge_forward_idx
    ON entity_edge (source_web_id, source_entity_uuid, kind, direction);

-- Backward index: for traversing from target back to source
CREATE INDEX entity_edge_backward_idx
    ON entity_edge (target_web_id, target_entity_uuid, kind, direction);

-- Populate from entity_has_left_entity (outgoing)
INSERT INTO entity_edge (
    source_web_id,
    source_entity_uuid,
    target_web_id,
    target_entity_uuid,
    kind,
    direction,
    provenance,
    confidence
)
SELECT
    web_id,
    entity_uuid,
    left_web_id,
    left_entity_uuid,
    'has-left-entity'::entity_edge_kind,
    'outgoing'::edge_direction,
    provenance,
    confidence
FROM entity_has_left_entity;

-- Populate from entity_has_left_entity (incoming - reversed)
INSERT INTO entity_edge (
    source_web_id,
    source_entity_uuid,
    target_web_id,
    target_entity_uuid,
    kind,
    direction,
    provenance,
    confidence
)
SELECT
    left_web_id,
    left_entity_uuid,
    web_id,
    entity_uuid,
    'has-left-entity'::entity_edge_kind,
    'incoming'::edge_direction,
    provenance,
    confidence
FROM entity_has_left_entity;

-- Populate from entity_has_right_entity (outgoing)
INSERT INTO entity_edge (
    source_web_id,
    source_entity_uuid,
    target_web_id,
    target_entity_uuid,
    kind,
    direction,
    provenance,
    confidence
)
SELECT
    web_id,
    entity_uuid,
    right_web_id,
    right_entity_uuid,
    'has-right-entity'::entity_edge_kind,
    'outgoing'::edge_direction,
    provenance,
    confidence
FROM entity_has_right_entity;

-- Populate from entity_has_right_entity (incoming - reversed)
INSERT INTO entity_edge (
    source_web_id,
    source_entity_uuid,
    target_web_id,
    target_entity_uuid,
    kind,
    direction,
    provenance,
    confidence
)
SELECT
    right_web_id,
    right_entity_uuid,
    web_id,
    entity_uuid,
    'has-right-entity'::entity_edge_kind,
    'incoming'::edge_direction,
    provenance,
    confidence
FROM entity_has_right_entity;

DROP TABLE entity_has_left_entity;
DROP TABLE entity_has_right_entity;

-- Create read-only views for backward compatibility
CREATE VIEW entity_has_left_entity AS
  SELECT
    source_web_id AS web_id,
    source_entity_uuid AS entity_uuid,
    target_web_id AS left_web_id,
    target_entity_uuid AS left_entity_uuid,
    provenance,
    confidence
  FROM entity_edge
  WHERE kind = 'has-left-entity' AND direction = 'outgoing';

CREATE VIEW entity_has_right_entity AS
  SELECT
    source_web_id AS web_id,
    source_entity_uuid AS entity_uuid,
    target_web_id AS right_web_id,
    target_entity_uuid AS right_entity_uuid,
    provenance,
    confidence
  FROM entity_edge
  WHERE kind = 'has-right-entity' AND direction = 'outgoing';
