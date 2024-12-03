CREATE TABLE data_types (
    ontology_id UUID PRIMARY KEY REFERENCES ontology_ids,
    schema JSONB NOT NULL,
    closed_schema JSONB NOT NULL
);

CREATE TABLE data_type_inherits_from (
    source_data_type_ontology_id UUID REFERENCES data_types,
    target_data_type_ontology_id UUID REFERENCES data_types,
    depth INT NOT NULL,
    UNIQUE (source_data_type_ontology_id, target_data_type_ontology_id)
);

CREATE VIEW data_type_inherits_from_aggregation AS
SELECT
    data_type_inherits_from.source_data_type_ontology_id,
    array_agg(
        data_type_inherits_from.target_data_type_ontology_id
    ) AS target_data_type_ontology_ids,
    array_agg(data_type_inherits_from.depth) AS depths
FROM data_type_inherits_from
GROUP BY data_type_inherits_from.source_data_type_ontology_id;

CREATE TABLE data_type_embeddings (
    ontology_id UUID PRIMARY KEY REFERENCES data_types,
    embedding VECTOR(3072) NOT NULL,
    updated_at_transaction_time TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE data_type_conversions (
    source_data_type_ontology_id UUID PRIMARY KEY REFERENCES data_types,
    target_data_type_base_url TEXT NOT NULL REFERENCES base_urls,
    "into" JSONB NOT NULL,
    "from" JSONB NOT NULL
);

CREATE VIEW data_type_conversion_aggregation AS
SELECT
    data_type_conversions.source_data_type_ontology_id,
    array_agg(data_type_conversions.target_data_type_base_url) AS target_data_type_base_urls,
    array_agg(data_type_conversions."into") AS intos,
    array_agg(data_type_conversions."from") AS froms
FROM data_type_conversions
GROUP BY data_type_conversions.source_data_type_ontology_id;
