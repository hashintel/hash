CREATE TABLE entity_property (
    entity_edition_id UUID NOT NULL REFERENCES entity_editions,
    property_path TEXT NOT NULL,
    confidence DOUBLE PRECISION
);

CREATE VIEW entity_properties AS
SELECT entity_edition_id, array_agg(property_path) AS property_paths, array_agg(confidence) AS confidences
FROM entity_property
GROUP BY entity_edition_id;

ALTER TABLE entity_editions
ADD COLUMN confidence DOUBLE PRECISION;

ALTER TABLE entity_has_left_entity
ADD COLUMN confidence DOUBLE PRECISION;

ALTER TABLE entity_has_right_entity
ADD COLUMN confidence DOUBLE PRECISION;
