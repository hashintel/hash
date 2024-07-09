ALTER TABLE data_types
    ADD COLUMN closed_schema JSONB;

UPDATE data_types
   SET closed_schema = jsonb_strip_nulls(jsonb_build_object(
        'schemas', jsonb_build_object(
            schema->>'$id', jsonb_build_object(
                'title', schema->'title',
                'description', schema->'description',
                'label', schema->'label'
            )
        ),
        'type', schema->'type',
        'const', schema->'const',
        'enum', schema->'enum',
        'multipleOf', schema->'multipleOf',
        'maximum', schema->'maximum',
        'exclusiveMaximum', schema->'exclusiveMaximum',
        'minimum', schema->'minimum',
        'exclusiveMinimum', schema->'exclusiveMinimum',
        'minLength', schema->'minLength',
        'maxLength', schema->'maxLength',
        'pattern', schema->'pattern',
        'format', schema->'format'
   ));

ALTER TABLE data_types
    ALTER COLUMN closed_schema SET NOT NULL;
