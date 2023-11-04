CREATE TABLE
  "entity_has_left_entity" (
    "web_id" UUID NOT NULL,
    "entity_uuid" UUID NOT NULL,
    "left_web_id" UUID NOT NULL,
    "left_entity_uuid" UUID NOT NULL,
    FOREIGN KEY ("web_id", "entity_uuid") REFERENCES "entity_ids",
    FOREIGN KEY ("left_web_id", "left_entity_uuid") REFERENCES "entity_ids"
  );

CREATE TABLE
  "entity_has_right_entity" (
    "web_id" UUID NOT NULL,
    "entity_uuid" UUID NOT NULL,
    "right_web_id" UUID NOT NULL,
    "right_entity_uuid" UUID NOT NULL,
    FOREIGN KEY ("web_id", "entity_uuid") REFERENCES "entity_ids",
    FOREIGN KEY ("right_web_id", "right_entity_uuid") REFERENCES "entity_ids"
  );

CREATE TABLE
  "entity_is_of_type" (
    "entity_edition_id" UUID NOT NULL REFERENCES "entity_editions",
    "entity_type_ontology_id" UUID NOT NULL REFERENCES "entity_types"
  );
