CREATE VIEW
  closed_entity_type_inherits_from AS
WITH RECURSIVE
  inherits_from AS (
    SELECT
      source_entity_type_ontology_id,
      target_entity_type_ontology_id,
      0 AS inheritance_depth
    FROM
      entity_type_inherits_from
    UNION ALL
    SELECT
      entity_type_inherits_from.source_entity_type_ontology_id,
      inherits_from.target_entity_type_ontology_id,
      inherits_from.inheritance_depth + 1 AS inheritance_depth
    FROM
      entity_type_inherits_from
      JOIN inherits_from ON entity_type_inherits_from.target_entity_type_ontology_id = inherits_from.source_entity_type_ontology_id
  )
SELECT
  *
FROM
  inherits_from;

CREATE VIEW
  closed_entity_type_constrains_properties_on AS
SELECT
  source_entity_type_ontology_id,
  target_property_type_ontology_id,
  0 AS inheritance_depth
FROM
  entity_type_constrains_properties_on
UNION
SELECT
  closed_entity_type_inherits_from.source_entity_type_ontology_id,
  entity_type_constrains_properties_on.target_property_type_ontology_id,
  closed_entity_type_inherits_from.inheritance_depth + 1
FROM
  closed_entity_type_inherits_from
  JOIN entity_type_constrains_properties_on ON entity_type_constrains_properties_on.source_entity_type_ontology_id = closed_entity_type_inherits_from.target_entity_type_ontology_id;

CREATE VIEW
  closed_entity_type_constrains_links_on AS
SELECT
  source_entity_type_ontology_id,
  target_entity_type_ontology_id,
  0 AS inheritance_depth
FROM
  entity_type_constrains_links_on
UNION
SELECT
  closed_entity_type_inherits_from.source_entity_type_ontology_id,
  entity_type_constrains_links_on.target_entity_type_ontology_id,
  closed_entity_type_inherits_from.inheritance_depth + 1
FROM
  closed_entity_type_inherits_from
  JOIN entity_type_constrains_links_on ON entity_type_constrains_links_on.source_entity_type_ontology_id = closed_entity_type_inherits_from.target_entity_type_ontology_id;

CREATE VIEW
  closed_entity_type_constrains_link_destinations_on AS
SELECT
  source_entity_type_ontology_id,
  target_entity_type_ontology_id,
  0 AS inheritance_depth
FROM
  entity_type_constrains_link_destinations_on
UNION
SELECT
  closed_entity_type_inherits_from.source_entity_type_ontology_id,
  entity_type_constrains_link_destinations_on.target_entity_type_ontology_id,
  closed_entity_type_inherits_from.inheritance_depth + 1
FROM
  closed_entity_type_inherits_from
  JOIN entity_type_constrains_link_destinations_on ON entity_type_constrains_link_destinations_on.source_entity_type_ontology_id = closed_entity_type_inherits_from.target_entity_type_ontology_id;

CREATE VIEW
  closed_entity_is_of_type AS
SELECT
  entity_edition_id,
  entity_type_ontology_id,
  0 AS inheritance_depth
FROM
  entity_is_of_type
UNION
SELECT
  entity_is_of_type.entity_edition_id,
  closed_entity_type_inherits_from.target_entity_type_ontology_id AS entity_type_ontology_id,
  closed_entity_type_inherits_from.inheritance_depth + 1
FROM
  entity_is_of_type
  JOIN closed_entity_type_inherits_from ON entity_is_of_type.entity_type_ontology_id = closed_entity_type_inherits_from.source_entity_type_ontology_id;
