CREATE TABLE data_type_conversions (
    "source_data_type_ontology_id" UUID PRIMARY KEY REFERENCES "data_types",
    "target_data_type_base_url" TEXT NOT NULL REFERENCES "base_urls",
    "into" JSONB NOT NULL,
    "from" JSONB NOT NULL
);
