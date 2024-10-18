ALTER TABLE entity_type_inherits_from
    ADD COLUMN depth INT,
    ADD CONSTRAINT unique_entity_type_inherits_from UNIQUE (source_entity_type_ontology_id, target_entity_type_ontology_id);
ALTER TABLE entity_is_of_type
    ADD COLUMN inheritance_depth INT,
    ADD CONSTRAINT unique_entity_is_of_type UNIQUE (entity_edition_id, entity_type_ontology_id);
ALTER TABLE entity_type_constrains_links_on
    ADD COLUMN inheritance_depth INT,
    ADD CONSTRAINT unique_entity_type_constrains_links_on UNIQUE (source_entity_type_ontology_id, target_entity_type_ontology_id);
ALTER TABLE entity_type_constrains_link_destinations_on
    ADD COLUMN inheritance_depth INT,
    ADD CONSTRAINT unique_entity_type_constrains_link_destinations_on UNIQUE (source_entity_type_ontology_id, target_entity_type_ontology_id);
ALTER TABLE entity_type_constrains_properties_on
    ADD COLUMN inheritance_depth INT,
    ADD CONSTRAINT unique_entity_type_constrains_properties_on UNIQUE (source_entity_type_ontology_id, target_property_type_ontology_id);

-- drive-by: Fix data type tables to enforce only a single parent of the same type
ALTER TABLE data_type_inherits_from
    ADD CONSTRAINT unique_data_type_inherits_from UNIQUE (source_data_type_ontology_id, target_data_type_ontology_id);

UPDATE entity_type_inherits_from
    SET depth = 0;
UPDATE entity_is_of_type
    SET inheritance_depth = 0;
UPDATE entity_type_constrains_links_on
    SET inheritance_depth = 0;
UPDATE entity_type_constrains_link_destinations_on
    SET inheritance_depth = 0;
UPDATE entity_type_constrains_properties_on
    SET inheritance_depth = 0;

ALTER TABLE entity_type_inherits_from
    ALTER COLUMN depth SET NOT NULL;
ALTER TABLE entity_is_of_type
    ALTER COLUMN inheritance_depth SET NOT NULL;
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

DROP VIEW entity_is_of_type_ids;
CREATE VIEW entity_is_of_type_ids AS
    SELECT
        entity_edition_id,
        array_agg(base_url) AS base_urls,
        array_agg(version) AS versions
    FROM entity_is_of_type
    JOIN ontology_ids ON entity_type_ontology_id = ontology_id
    WHERE entity_is_of_type.inheritance_depth = 0
    GROUP BY entity_edition_id
