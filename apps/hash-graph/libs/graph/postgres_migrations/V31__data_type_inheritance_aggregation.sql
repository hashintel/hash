CREATE VIEW data_type_inherits_from_aggregation AS
    SELECT
        source_data_type_ontology_id,
        array_agg(target_data_type_ontology_id) AS target_data_type_ontology_ids,
        array_agg(depth) AS depths
    FROM data_type_inherits_from
    GROUP BY source_data_type_ontology_id;
