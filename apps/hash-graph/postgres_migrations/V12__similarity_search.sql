CREATE EXTENSION "vector";

CREATE TABLE "entity_embeddings" (
    "web_id"      UUID,
    "entity_uuid" UUID,
    "embedding"   VECTOR(1536) NOT NULL,
    PRIMARY KEY ("web_id", "entity_uuid"),
    FOREIGN KEY ("web_id", "entity_uuid") REFERENCES "entity_ids"
);

CREATE TABLE "entity_property_embeddings" (
    "web_id"      UUID,
    "entity_uuid" UUID,
    "base_url"    TEXT REFERENCES base_urls,
    "embedding"   VECTOR(1536) NOT NULL,
    PRIMARY KEY ("web_id", "entity_uuid", "base_url"),
    FOREIGN KEY ("web_id", "entity_uuid") REFERENCES "entity_ids"
);

CREATE TABLE "entity_type_embeddings" (
    "ontology_id" UUID PRIMARY KEY REFERENCES entity_types,
    "embedding"   VECTOR(1536) NOT NULL
);

CREATE TABLE "property_type_embeddings" (
    "ontology_id" UUID PRIMARY KEY REFERENCES property_types,
    "embedding"   VECTOR(1536) NOT NULL
);

CREATE TABLE "data_type_embeddings" (
    "ontology_id" UUID PRIMARY KEY REFERENCES data_types,
    "embedding"   VECTOR(1536) NOT NULL
);
