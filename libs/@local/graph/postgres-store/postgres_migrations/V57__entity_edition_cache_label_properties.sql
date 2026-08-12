-- The cache's `labels` keeps the label values and drops which `labelProperty` path produced
-- each one, so a reader capping or attributing properties has to re-derive the winning path
-- per read. `label_properties` stores that path per label: both arrays aggregate over the
-- same rows in the same order under the same non-null filter, so `labels[i]` is the value of
-- the property named by `label_properties[i]`, and `label_properties[1]` names the property
-- providing the entity's display label. NULL exactly when `labels` is NULL.
ALTER TABLE entity_edition_cache ADD COLUMN label_properties TEXT [];

UPDATE entity_edition_cache
SET label_properties = derived.label_properties
FROM (
    SELECT
        entity_is_of_type.entity_edition_id,
        array_agg(label_value.path
            ORDER BY entity_types.schema ->> 'title', ontology_ids.base_url,
                ontology_ids.version DESC, label_value.ordinality
        ) FILTER (WHERE label_value.label IS NOT NULL) AS label_properties
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
            label_path.path,
            label_path.ordinality
        FROM jsonb_array_elements_text(jsonb_path_query_array(entity_types.closed_schema, '$.allOf[*].labelProperty'))
        WITH ORDINALITY AS label_path (path, ordinality)
    ) AS label_value
    WHERE entity_is_of_type.inheritance_depth = 0
    GROUP BY entity_is_of_type.entity_edition_id
) AS derived
WHERE entity_edition_cache.entity_edition_id = derived.entity_edition_id;
