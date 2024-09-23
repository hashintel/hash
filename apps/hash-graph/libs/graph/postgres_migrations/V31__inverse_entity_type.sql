ALTER TABLE entity_types
    ADD COLUMN inverse JSONB NOT NULL DEFAULT '{}';
