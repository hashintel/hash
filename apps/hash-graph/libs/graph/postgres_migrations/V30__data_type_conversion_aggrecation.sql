CREATE VIEW data_type_conversion_aggregation AS
    SELECT
        source_data_type_ontology_id,
        array_agg(target_data_type_base_url) AS target_data_type_base_urls,
        array_agg("into") AS intos,
        array_agg("from") AS froms
    FROM data_type_conversions
    GROUP BY source_data_type_ontology_id;
