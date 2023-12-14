CREATE EXTENSION "vector";

CREATE TABLE "entity_embeddings" (
    "web_id"      UUID NOT NULL,
    "entity_uuid" UUID NOT NULL,
    "property"    TEXT REFERENCES "base_urls",
    "embedding"   VECTOR(1536) NOT NULL,
    FOREIGN KEY ("web_id", "entity_uuid") REFERENCES "entity_ids"
);

CREATE UNIQUE INDEX "entity_embeddings_idx"
    ON "entity_embeddings" ("web_id", "entity_uuid", "property") NULLS NOT DISTINCT;

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
