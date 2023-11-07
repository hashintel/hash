CREATE TABLE "property_type_constrains_values_on" (
    "source_property_type_ontology_id" UUID NOT NULL REFERENCES "property_types",
    "target_data_type_ontology_id"     UUID NOT NULL REFERENCES "data_types"
);

CREATE TABLE "property_type_constrains_properties_on" (
    "source_property_type_ontology_id" UUID NOT NULL REFERENCES "property_types",
    "target_property_type_ontology_id" UUID NOT NULL REFERENCES "property_types"
);


CREATE TABLE "entity_type_constrains_properties_on" (
    "source_entity_type_ontology_id"   UUID NOT NULL REFERENCES "entity_types",
    "target_property_type_ontology_id" UUID NOT NULL REFERENCES "property_types"
);

CREATE TABLE "entity_type_inherits_from" (
    "source_entity_type_ontology_id" UUID NOT NULL REFERENCES "entity_types",
    "target_entity_type_ontology_id" UUID NOT NULL REFERENCES "entity_types"
);

CREATE TABLE "entity_type_constrains_links_on" (
    "source_entity_type_ontology_id" UUID NOT NULL REFERENCES "entity_types",
    "target_entity_type_ontology_id" UUID NOT NULL REFERENCES "entity_types"
);

CREATE TABLE "entity_type_constrains_link_destinations_on" (
    "source_entity_type_ontology_id" UUID NOT NULL REFERENCES "entity_types",
    "target_entity_type_ontology_id" UUID NOT NULL REFERENCES "entity_types"
);
