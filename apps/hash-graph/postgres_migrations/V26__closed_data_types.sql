ALTER TABLE data_types
    ADD COLUMN closed_schema JSONB;

UPDATE data_types
   SET closed_schema = jsonb_strip_nulls(jsonb_build_object(
        'label', schema->'label',
        'type', jsonb_build_array(schema->'type'),
        'enum', CASE
            WHEN schema->'const' IS NOT NULL THEN jsonb_build_array(schema->'const')
            ELSE schema->'enum'
        END,
        'multipleOf', jsonb_build_array(schema->'multipleOf'),
        'maximum', schema->'maximum',
        'exclusiveMaximum', schema->'exclusiveMaximum',
        'minimum', schema->'minimum',
        'exclusiveMinimum', schema->'exclusiveMinimum',
        'minLength', schema->'minLength',
        'maxLength', schema->'maxLength',
        'pattern', jsonb_build_array(schema->'pattern'),
        'format', schema->'format'
   ));

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
