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
    entity_temporal_metadata.entity_edition_id,
    jsonb_extract_path(
        entity_editions.properties,
        jsonb_array_elements_text(
            jsonb_path_query_array(
                entity_types.closed_schema,
                '$.allOf[*].label_property'
            )
        )
    ) AS label_property
FROM entity_temporal_metadata
INNER JOIN entity_editions
    ON entity_temporal_metadata.entity_edition_id = entity_editions.entity_edition_id
INNER JOIN entity_is_of_type
    ON entity_temporal_metadata.entity_edition_id = entity_is_of_type.entity_edition_id
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
