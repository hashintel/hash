CREATE TABLE IF NOT EXISTS
  "closed_entity_types" (
    "closed_ontology_id" UUID PRIMARY KEY NOT NULL,
    "closed_schema" JSONB NOT NULL,
    "is_link_type" BOOLEAN NOT NULL
  );

COMMENT
  ON TABLE "closed_entity_types" IS $pga$
    This table represents all entity types in the system. Their schemas are inlined and available 
    to be used from this table. 
$pga$;

CREATE TABLE IF NOT EXISTS
  "closed_entity_types_to_constituent_types" (
    "closed_ontology_id" UUID NOT NULL REFERENCES "closed_entity_types",
    -- An ancestor of the type in the closure 
    -- (e.g. a grandparent of the type under an inheritance chain)
    -- We're referencing "ontology_ids" here because we don't want to box ourselves into only having
    -- owned types here.
    -- We want to be able to have constitutent types that are cached external types, or owned types.
    "constituent_ontology_id" UUID NOT NULL REFERENCES "ontology_ids",
    -- For a normal (owned or cached external) entity type this will be true if this is the closure 
    -- of that entity type. 
    -- If this is a closure of an "anonymous" type, this will be true for all entity types that make
    -- up the anonymous type.
    -- This is therefore a *superset* of the inverse of the set of "entity_types_to_closed_entity_types"
    "direct" BOOLEAN NOT NULL,
    -- Entity type closures cannot consist of multiples of the same ontology_id.
    PRIMARY KEY ("closed_ontology_id", "constituent_ontology_id")
  );

COMMENT
  ON TABLE "closed_entity_types_to_constituent_types" IS $pga$ 
    This table represents a transitive closure of an inheritance chain for a given entity type. 
    This is also able to represent "anonymous" entity types which are combinations of (compatible) 
    entity types. 
$pga$;

CREATE TABLE IF NOT EXISTS
  "entity_types_to_closed_entity_types" (
    "constituent_ontology_id" UUID NOT NULL REFERENCES "entity_types",
    "closed_ontology_id" UUID NOT NULL REFERENCES "closed_entity_types"
  );

COMMENT
  ON TABLE "entity_types_to_closed_entity_types" IS $pga$ 
    This table represents the mapping from entity types  to their closure. 
    This allows for an entity type to find its ancestor entity types. 
$pga$;
