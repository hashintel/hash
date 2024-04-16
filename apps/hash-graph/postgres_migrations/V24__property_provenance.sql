ALTER TABLE entity_property
    ADD COLUMN provenance JSONB;

-- ALTER TABLE entity_has_left_entity
--     ADD COLUMN provenance JSONB;
--
-- ALTER TABLE entity_has_right_entity
--     ADD COLUMN provenance JSONB;

DROP VIEW entity_properties;
CREATE VIEW entity_properties AS
    SELECT
        entity_edition_id,
        array_agg(property_path) AS property_paths,
        array_agg(confidence) AS confidences,
        array_agg(provenance) AS provenances
    FROM entity_property
    GROUP BY entity_edition_id;
