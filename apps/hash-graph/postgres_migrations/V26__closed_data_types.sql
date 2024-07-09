ALTER TABLE data_types
    ADD COLUMN closed_schema JSONB;

UPDATE data_types
   SET closed_schema = schema;

ALTER TABLE data_types
    ALTER COLUMN closed_schema SET NOT NULL;

CREATE TABLE data_type_inherits_from (
    source_data_type_ontology_id UUID NOT NULL REFERENCES data_types,
    target_data_type_ontology_id UUID NOT NULL REFERENCES data_types,
    depth INT NOT NULL
);

CREATE TABLE data_type_constrains_values_on (
    source_data_type_ontology_id UUID NOT NULL REFERENCES data_types,
    target_data_type_ontology_id UUID NOT NULL REFERENCES data_types
);
