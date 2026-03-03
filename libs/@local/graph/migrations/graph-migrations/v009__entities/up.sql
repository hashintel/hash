CREATE TABLE entity_ids (
    web_id UUID NOT NULL REFERENCES web,
    entity_uuid UUID NOT NULL,
    provenance JSONB NOT NULL,
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
    confidence DOUBLE PRECISION
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

CREATE VIEW entity_is_of_type_ids AS
SELECT
    entity_is_of_type.entity_edition_id,
    array_agg(ontology_ids.base_url) AS base_urls,
    array_agg(ontology_ids.version) AS versions
FROM entity_is_of_type
INNER JOIN ontology_ids ON entity_is_of_type.entity_type_ontology_id = ontology_ids.ontology_id
WHERE entity_is_of_type.inheritance_depth = 0
GROUP BY entity_is_of_type.entity_edition_id;

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


CREATE VIEW type_title_for_entity AS
SELECT
    entity_temporal_metadata.entity_edition_id,
    entity_types.schema ->> 'title' AS title
FROM entity_temporal_metadata
INNER JOIN entity_is_of_type
    ON entity_temporal_metadata.entity_edition_id = entity_is_of_type.entity_edition_id
INNER JOIN ontology_temporal_metadata
    ON entity_is_of_type.entity_type_ontology_id = ontology_temporal_metadata.ontology_id
INNER JOIN entity_types
    ON ontology_temporal_metadata.ontology_id = entity_types.ontology_id
WHERE ontology_temporal_metadata.transaction_time @> now()
    AND entity_is_of_type.inheritance_depth = 0;

CREATE VIEW first_type_title_for_entity AS
SELECT
    type_title_for_entity.entity_edition_id,
    min(type_title_for_entity.title) AS title
FROM type_title_for_entity
GROUP BY type_title_for_entity.entity_edition_id;

CREATE VIEW last_type_title_for_entity AS
SELECT
    type_title_for_entity.entity_edition_id,
    max(type_title_for_entity.title) AS title
FROM type_title_for_entity
GROUP BY type_title_for_entity.entity_edition_id;


CREATE VIEW label_for_entity AS
SELECT
    entity_editions.entity_edition_id,
    jsonb_extract_path(
        entity_editions.properties,
        jsonb_array_elements_text(
            jsonb_path_query_array(
                entity_types.closed_schema,
                '$.allOf[*].labelProperty'
            )
        )
    ) AS label_property
FROM entity_editions
INNER JOIN entity_is_of_type
    ON entity_editions.entity_edition_id = entity_is_of_type.entity_edition_id
INNER JOIN ontology_temporal_metadata
    ON entity_is_of_type.entity_type_ontology_id = ontology_temporal_metadata.ontology_id
INNER JOIN entity_types
    ON ontology_temporal_metadata.ontology_id = entity_types.ontology_id
WHERE ontology_temporal_metadata.transaction_time @> now()
    AND entity_is_of_type.inheritance_depth = 0;

CREATE VIEW first_label_for_entity AS
SELECT
    label_for_entity.entity_edition_id,
    (array_agg(
        label_for_entity.label_property
        ORDER BY label_for_entity.label_property ASC
    ))[1] AS label_property
FROM label_for_entity
GROUP BY label_for_entity.entity_edition_id;

CREATE VIEW last_label_for_entity AS
SELECT
    label_for_entity.entity_edition_id,
    (array_agg(
        label_for_entity.label_property
        ORDER BY label_for_entity.label_property DESC
    ))[1] AS label_property
FROM label_for_entity
GROUP BY label_for_entity.entity_edition_id;
