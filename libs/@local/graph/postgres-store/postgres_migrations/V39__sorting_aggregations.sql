CREATE VIEW entity_title_agg AS
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

CREATE VIEW first_entity_titles AS
SELECT
    entity_title_agg.entity_edition_id,
    min(entity_title_agg.title) AS title
FROM entity_title_agg
GROUP BY entity_title_agg.entity_edition_id;

CREATE VIEW last_entity_titles AS
SELECT
    entity_title_agg.entity_edition_id,
    max(entity_title_agg.title) AS title
FROM entity_title_agg
GROUP BY entity_title_agg.entity_edition_id;


CREATE VIEW entity_label_agg AS
SELECT
    entity_temporal_metadata.entity_edition_id,
    jsonb_extract_path(
        entity_editions.properties,
        jsonb_array_elements_text(
            jsonb_path_query_array(
                entity_types.closed_schema,
                '$.allOf[*].labelProperty'
            )
        )
    ) AS property
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

CREATE VIEW first_entity_labels AS
SELECT
    entity_label_agg.entity_edition_id,
    (array_agg(entity_label_agg.property ORDER BY property ASC))[1] AS label
FROM entity_label_agg
GROUP BY entity_label_agg.entity_edition_id;

CREATE VIEW last_entity_labels AS
SELECT
    entity_label_agg.entity_edition_id,
    (array_agg(entity_label_agg.property ORDER BY property DESC))[1] AS label
FROM entity_label_agg
GROUP BY entity_label_agg.entity_edition_id;
