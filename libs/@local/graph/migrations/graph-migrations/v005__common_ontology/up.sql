CREATE TABLE base_urls (
    base_url TEXT PRIMARY KEY
);

CREATE TABLE ontology_ids (
    ontology_id UUID PRIMARY KEY,
    base_url TEXT NOT NULL REFERENCES base_urls,
    version BIGINT NOT NULL,
    UNIQUE (base_url, version)
);

CREATE TABLE ontology_owned_metadata (
    ontology_id UUID PRIMARY KEY REFERENCES ontology_ids,
    web_id UUID NOT NULL REFERENCES web
);

CREATE TABLE ontology_external_metadata (
    ontology_id UUID PRIMARY KEY REFERENCES ontology_ids,
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE ontology_temporal_metadata (
    ontology_id UUID NOT NULL REFERENCES ontology_ids,
    transaction_time TSTZRANGE NOT NULL,
    provenance JSONB NOT NULL,
    EXCLUDE USING gist (
        ontology_id WITH =,
        transaction_time WITH &&
    )
);

CREATE VIEW ontology_additional_metadata AS
SELECT
    ontology_owned_metadata.ontology_id,
    jsonb_build_object(
        'web_id',
        ontology_owned_metadata.web_id
    ) AS additional_metadata
FROM ontology_owned_metadata
UNION ALL
SELECT
    ontology_external_metadata.ontology_id,
    jsonb_build_object(
        'fetched_at',
        ontology_external_metadata.fetched_at
    ) AS additional_metadata
FROM ontology_external_metadata;
