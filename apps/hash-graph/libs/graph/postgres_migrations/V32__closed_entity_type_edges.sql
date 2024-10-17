ALTER TABLE entity_type_inherits_from
    ADD COLUMN depth INT;
-- ALTER TABLE entity_is_of_type
    -- ADD COLUMN inheritance_depth INT;
ALTER TABLE entity_type_constrains_links_on
    ADD COLUMN inheritance_depth INT;
ALTER TABLE entity_type_constrains_link_destinations_on
    ADD COLUMN inheritance_depth INT;
ALTER TABLE entity_type_constrains_properties_on
    ADD COLUMN inheritance_depth INT;

UPDATE entity_type_inherits_from
    SET depth = 0;
-- UPDATE entity_is_of_type
    -- SET inheritance_depth = 0;
UPDATE entity_type_constrains_links_on
    SET inheritance_depth = 0;
UPDATE entity_type_constrains_link_destinations_on
    SET inheritance_depth = 0;
UPDATE entity_type_constrains_properties_on
    SET inheritance_depth = 0;

ALTER TABLE entity_type_inherits_from
    ALTER COLUMN depth SET NOT NULL;
-- ALTER TABLE entity_is_of_type
    -- ALTER COLUMN inheritance_depth SET NOT NULL;
ALTER TABLE entity_type_constrains_links_on
    ALTER COLUMN inheritance_depth SET NOT NULL;
ALTER TABLE entity_type_constrains_link_destinations_on
    ALTER COLUMN inheritance_depth SET NOT NULL;
ALTER TABLE entity_type_constrains_properties_on
    ALTER COLUMN inheritance_depth SET NOT NULL;

DROP VIEW closed_entity_is_of_type;
DROP VIEW closed_entity_type_constrains_properties_on;
DROP VIEW closed_entity_type_constrains_links_on;
DROP VIEW closed_entity_type_constrains_link_destinations_on;
DROP VIEW closed_entity_type_inherits_from;

CREATE VIEW closed_entity_is_of_type AS
    SELECT entity_edition_id,
           entity_type_ontology_id,
           0 AS inheritance_depth
      FROM entity_is_of_type
    UNION
    SELECT entity_is_of_type.entity_edition_id,
           entity_type_inherits_from.target_entity_type_ontology_id AS entity_type_ontology_id,
           entity_type_inherits_from.depth + 1 AS inheritance_depth
      FROM entity_is_of_type
      JOIN entity_type_inherits_from
        ON entity_is_of_type.entity_type_ontology_id = entity_type_inherits_from.source_entity_type_ontology_id;
