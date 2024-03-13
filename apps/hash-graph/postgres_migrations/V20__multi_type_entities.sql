CREATE VIEW entity_is_of_type_ids AS
    SELECT entity_edition_id, array_agg(base_url) AS base_urls, array_agg(version) AS versions
    FROM entity_is_of_type
    JOIN ontology_ids ON entity_type_ontology_id = ontology_id
    GROUP BY entity_edition_id
