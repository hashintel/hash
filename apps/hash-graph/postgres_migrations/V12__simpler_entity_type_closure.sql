DROP TABLE
  "closed_entity_types",
  "closed_entity_types_to_constituent_types",
  "entity_types_to_closed_entity_types";

ALTER TABLE
  "entity_types"
ADD COLUMN
  "closed_schema" JSONB;

UPDATE
  "entity_types"
SET
  "closed_schema" = entity_types.schema
WHERE
  "closed_schema" IS NULL;

ALTER TABLE
  "entity_types"
ALTER COLUMN
  "closed_schema"
SET NOT NULL;

ALTER TABLE
  "entity_type_inherits_from"
ADD COLUMN
  "inheritance_depth" INTEGER;

UPDATE
  "entity_type_inherits_from"
SET
  "inheritance_depth" = 0
WHERE
  "inheritance_depth" IS NULL;

ALTER TABLE
  "entity_type_inherits_from"
ALTER COLUMN
  "inheritance_depth"
SET NOT NULL;

ALTER TABLE
  "entity_type_constrains_properties_on"
ADD COLUMN
  "inheritance_depth" INTEGER;

UPDATE
  "entity_type_constrains_properties_on"
SET
  "inheritance_depth" = 0
WHERE
  "inheritance_depth" IS NULL;

ALTER TABLE
  "entity_type_constrains_properties_on"
ALTER COLUMN
  "inheritance_depth"
SET NOT NULL;

ALTER TABLE
  "entity_type_constrains_links_on"
ADD COLUMN
  "inheritance_depth" INTEGER;

UPDATE
  "entity_type_constrains_links_on"
SET
  "inheritance_depth" = 0
WHERE
  "inheritance_depth" IS NULL;

ALTER TABLE
  "entity_type_constrains_links_on"
ALTER COLUMN
  "inheritance_depth"
SET NOT NULL;

ALTER TABLE
  "entity_type_constrains_link_destinations_on"
ADD COLUMN
  "inheritance_depth" INTEGER;

UPDATE
  "entity_type_constrains_link_destinations_on"
SET
  "inheritance_depth" = 0
WHERE
  "inheritance_depth" IS NULL;

ALTER TABLE
  "entity_type_constrains_link_destinations_on"
ALTER COLUMN
  "inheritance_depth"
SET NOT NULL;

ALTER TABLE
  "entity_is_of_type"
ADD COLUMN
  "inheritance_depth" INTEGER;

UPDATE
  "entity_is_of_type"
SET
  "inheritance_depth" = 0
WHERE
  "inheritance_depth" IS NULL;

ALTER TABLE
  "entity_is_of_type"
ALTER COLUMN
  "inheritance_depth"
SET NOT NULL;
