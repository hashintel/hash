DROP VIEW entity_properties;
DROP TABLE entity_property;

ALTER TABLE entity_editions
    ADD COLUMN property_metadata JSONB;
