CREATE TABLE entity_types (
    ontology_id UUID PRIMARY KEY REFERENCES ontology_ids,
    schema JSONB NOT NULL,
    closed_schema JSONB NOT NULL
);

CREATE TABLE entity_type_inherits_from (
    source_entity_type_ontology_id UUID NOT NULL REFERENCES entity_types,
    target_entity_type_ontology_id UUID NOT NULL REFERENCES entity_types,
    depth INT NOT NULL,
    UNIQUE (source_entity_type_ontology_id, target_entity_type_ontology_id)
);

CREATE TABLE entity_type_constrains_properties_on (
    source_entity_type_ontology_id UUID NOT NULL REFERENCES entity_types,
    target_property_type_ontology_id UUID NOT NULL REFERENCES property_types,
    inheritance_depth INT NOT NULL,
    UNIQUE (source_entity_type_ontology_id, target_property_type_ontology_id)
);

CREATE TABLE entity_type_constrains_links_on (
    source_entity_type_ontology_id UUID NOT NULL REFERENCES entity_types,
    target_entity_type_ontology_id UUID NOT NULL REFERENCES entity_types,
    inheritance_depth INT NOT NULL,
    UNIQUE (source_entity_type_ontology_id, target_entity_type_ontology_id)
);

CREATE TABLE entity_type_constrains_link_destinations_on (
    source_entity_type_ontology_id UUID NOT NULL REFERENCES entity_types,
    target_entity_type_ontology_id UUID NOT NULL REFERENCES entity_types,
    inheritance_depth INT NOT NULL,
    UNIQUE (source_entity_type_ontology_id, target_entity_type_ontology_id)
);


CREATE TABLE entity_type_embeddings (
    ontology_id UUID PRIMARY KEY REFERENCES entity_types,
    embedding VECTOR(3072) NOT NULL,
    updated_at_transaction_time TIMESTAMP WITH TIME ZONE NOT NULL
);
