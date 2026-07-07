-- Denormalized per-edition cache of an entity's type/label aggregates. Computing these
-- inline forces the planner to re-evaluate the aggregation per row in entity-subgraph
-- queries; reading the cache instead is a single 1:1 join.
--
-- The cache is derived data: rows are inserted alongside `entity_is_of_type` writes and
-- can be fully rebuilt at any time (`reindex_entity_cache`), e.g. after in-place changes
-- to entity-type schemas. A row exists exactly for editions that have at least one
-- depth-0 entity type.
--
-- The four type-derived arrays (`type_titles`, `base_urls`, `versions`,
-- `versioned_urls`) are
-- positionally aligned and cover ALL inheritance depths so that type predicates
-- (containment via `@>`) match supertypes. Order is (inheritance depth, title,
-- base URL, version DESC); the entity's direct types therefore form the array prefix
-- of length `direct_types` (used to project `entityTypeIds`), and `[1]` is the
-- canonically first direct type, providing the type-title sort key. Titles are taken
-- from `entity_types` without the `transaction_time @> now()` filter, so the cache
-- does not depend on type archival state.
--
-- `labels` is resolved per DIRECT type (label inheritance already lives in each type's
-- `closed_schema.allOf`, nearest ancestor first), ordered by the canonical type order
-- (title, base URL, version DESC) with the `allOf` position as tie-breaker within one
-- type. `labels[1]` is the entity's display/sort label; NULL means the entity has no
-- label. Descending sorts use the same element — there is no min/max flip.
CREATE TABLE entity_edition_cache (
    entity_edition_id UUID PRIMARY KEY REFERENCES entity_editions ON DELETE CASCADE,
    direct_types INT NOT NULL,
    labels TEXT [],
    type_titles TEXT [] NOT NULL,
    base_urls TEXT [] NOT NULL,
    versions BIGINT [] NOT NULL,
    versioned_urls TEXT [] NOT NULL
);

INSERT INTO entity_edition_cache (
    entity_edition_id,
    direct_types,
    labels,
    type_titles,
    base_urls,
    versions,
    versioned_urls
)
SELECT
    types.entity_edition_id,
    types.direct_types,
    labels.labels,
    types.type_titles,
    types.base_urls,
    types.versions,
    types.versioned_urls
FROM (
    SELECT
        entity_is_of_type.entity_edition_id,
        count(*) FILTER (WHERE entity_is_of_type.inheritance_depth = 0) AS direct_types,
        array_agg(entity_types.schema ->> 'title'
            ORDER BY entity_is_of_type.inheritance_depth,
                entity_types.schema ->> 'title', ontology_ids.base_url,
                ontology_ids.version DESC
        ) AS type_titles,
        array_agg(ontology_ids.base_url
            ORDER BY entity_is_of_type.inheritance_depth,
                entity_types.schema ->> 'title', ontology_ids.base_url,
                ontology_ids.version DESC
        ) AS base_urls,
        array_agg(ontology_ids.version
            ORDER BY entity_is_of_type.inheritance_depth,
                entity_types.schema ->> 'title', ontology_ids.base_url,
                ontology_ids.version DESC
        ) AS versions,
        array_agg(ontology_ids.base_url || 'v/' || ontology_ids.version
            ORDER BY entity_is_of_type.inheritance_depth,
                entity_types.schema ->> 'title', ontology_ids.base_url,
                ontology_ids.version DESC
        ) AS versioned_urls
    FROM entity_is_of_type
    INNER JOIN ontology_ids
        ON entity_is_of_type.entity_type_ontology_id = ontology_ids.ontology_id
    INNER JOIN entity_types
        ON ontology_ids.ontology_id = entity_types.ontology_id
    GROUP BY entity_is_of_type.entity_edition_id
) AS types
LEFT JOIN (
    SELECT
        entity_is_of_type.entity_edition_id,
        array_agg(label_value.label
            ORDER BY entity_types.schema ->> 'title', ontology_ids.base_url,
                ontology_ids.version DESC, label_value.ordinality
        ) FILTER (WHERE label_value.label IS NOT NULL) AS labels
    FROM entity_is_of_type
    INNER JOIN ontology_ids
        ON entity_is_of_type.entity_type_ontology_id = ontology_ids.ontology_id
    INNER JOIN entity_types
        ON ontology_ids.ontology_id = entity_types.ontology_id
    INNER JOIN entity_editions
        ON entity_is_of_type.entity_edition_id = entity_editions.entity_edition_id
    CROSS JOIN LATERAL (
        SELECT
            jsonb_extract_path(entity_editions.properties, label_path.path) #>> '{}' AS label,
            label_path.ordinality
        FROM jsonb_array_elements_text(jsonb_path_query_array(entity_types.closed_schema, '$.allOf[*].labelProperty'))
        WITH ORDINALITY AS label_path (path, ordinality)
    ) AS label_value
    WHERE entity_is_of_type.inheritance_depth = 0
    GROUP BY entity_is_of_type.entity_edition_id
) AS labels
    ON types.entity_edition_id = labels.entity_edition_id;

-- Type filters arrive as containment checks (`@>`); labels/titles are only sorted or
-- projected, never filtered, so they carry no index.
CREATE INDEX entity_edition_cache_base_urls ON entity_edition_cache USING gin (base_urls);
CREATE INDEX entity_edition_cache_versioned_urls ON entity_edition_cache USING gin (versioned_urls);

-- The cache replaces the per-row aggregate views for every consumer (query compiler and
-- HashQL), so they are dropped.
DROP VIEW first_label_for_entity;
DROP VIEW last_label_for_entity;
DROP VIEW label_for_entity;
DROP VIEW first_type_title_for_entity;
DROP VIEW last_type_title_for_entity;
DROP VIEW type_title_for_entity;
DROP VIEW entity_is_of_type_ids;
