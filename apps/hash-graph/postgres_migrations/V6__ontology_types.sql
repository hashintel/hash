CREATE TABLE
  "data_types" (
    "ontology_id" UUID PRIMARY KEY REFERENCES "ontology_ids",
    "schema" JSONB NOT NULL
  );

CREATE TABLE
  "property_types" (
    "ontology_id" UUID PRIMARY KEY REFERENCES "ontology_ids",
    "schema" JSONB NOT NULL
  );

CREATE TABLE
  "entity_types" (
    "ontology_id" UUID PRIMARY KEY REFERENCES "ontology_ids",
    "schema" JSONB NOT NULL,
    "closed_schema" JSONB NOT NULL,
    "icon" TEXT,
    "label_property" TEXT REFERENCES "base_urls"
  );
