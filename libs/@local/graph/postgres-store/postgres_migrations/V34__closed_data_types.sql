ALTER TABLE data_types
    ADD COLUMN closed_schema JSONB;

UPDATE data_types
   SET closed_schema = '{}';

ALTER TABLE data_types
    ALTER COLUMN closed_schema SET NOT NULL;
