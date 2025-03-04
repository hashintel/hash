CREATE OR REPLACE VIEW label_for_entity AS
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
