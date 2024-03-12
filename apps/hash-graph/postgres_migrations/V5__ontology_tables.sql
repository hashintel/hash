CREATE TABLE "base_urls" (
    "base_url" TEXT PRIMARY KEY
);

CREATE TABLE "ontology_ids" (
    "ontology_id" UUID PRIMARY KEY,
    "base_url"    TEXT   NOT NULL REFERENCES "base_urls",
    "version"     BIGINT NOT NULL,
    UNIQUE ("base_url", "version")
);

CREATE TABLE "ontology_owned_metadata" (
    "ontology_id" UUID PRIMARY KEY REFERENCES "ontology_ids",
    "web_id"      UUID NOT NULL REFERENCES "webs"
);

CREATE TABLE "ontology_external_metadata" (
    "ontology_id" UUID PRIMARY KEY REFERENCES "ontology_ids",
    "fetched_at"  TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE VIEW "ontology_additional_metadata" AS
    SELECT "ontology_id",
           JSONB_BUILD_OBJECT(
                   'web_id',
                   ontology_owned_metadata.web_id
           ) AS "additional_metadata"
    FROM ontology_owned_metadata
    UNION ALL
    SELECT "ontology_id",
           JSONB_BUILD_OBJECT(
                   'fetched_at',
                   ontology_external_metadata.fetched_at
           ) AS "additional_metadata"
    FROM ontology_external_metadata;


CREATE TABLE "ontology_temporal_metadata" (
    "ontology_id"           UUID      NOT NULL REFERENCES "ontology_ids",
    "transaction_time"      tstzrange NOT NULL,
    "record_created_by_id"  UUID REFERENCES "accounts",
    "record_archived_by_id" UUID REFERENCES "accounts",
    EXCLUDE USING gist (
        ontology_id WITH =,
        transaction_time WITH &&
    ),
    CHECK (("record_archived_by_id" IS NULL) = (UPPER("transaction_time") IS NULL))
);
