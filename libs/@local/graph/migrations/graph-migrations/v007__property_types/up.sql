CREATE TABLE property_types (
    ontology_id UUID PRIMARY KEY REFERENCES ontology_ids,
    schema JSONB NOT NULL
);

CREATE TABLE property_type_constrains_values_on (
    source_property_type_ontology_id UUID NOT NULL REFERENCES property_types,
    target_data_type_ontology_id UUID NOT NULL REFERENCES data_types
);

CREATE TABLE property_type_constrains_properties_on (
    source_property_type_ontology_id UUID NOT NULL REFERENCES property_types,
    target_property_type_ontology_id UUID NOT NULL REFERENCES property_types
);

CREATE TABLE property_type_embeddings (
    ontology_id UUID PRIMARY KEY REFERENCES property_types,
    embedding VECTOR(3072) NOT NULL,
    updated_at_transaction_time TIMESTAMP WITH TIME ZONE NOT NULL
);
