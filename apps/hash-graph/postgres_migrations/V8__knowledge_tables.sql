CREATE TABLE "entity_ids" (
    "web_id"      UUID NOT NULL REFERENCES "webs",
    "entity_uuid" UUID NOT NULL,
    PRIMARY KEY ("web_id", "entity_uuid")
);

CREATE TABLE "entity_editions" (
    "entity_edition_id"    UUID    NOT NULL PRIMARY KEY,
    "properties"           JSONB   NOT NULL,
    "left_to_right_order"  INTEGER,
    "right_to_left_order"  INTEGER,
    "record_created_by_id" UUID    NOT NULL REFERENCES "accounts",
    "archived"             BOOLEAN NOT NULL
);

CREATE TABLE "entity_temporal_metadata" (
    "web_id"            UUID      NOT NULL,
    "entity_uuid"       UUID      NOT NULL,
    "entity_edition_id" UUID      NOT NULL REFERENCES "entity_editions",
    "decision_time"     tstzrange NOT NULL,
    "transaction_time"  tstzrange NOT NULL,
    FOREIGN KEY ("web_id", "entity_uuid") REFERENCES "entity_ids",
    CONSTRAINT entity_temporal_metadata_overlapping EXCLUDE USING gist (
        web_id WITH =,
        entity_uuid WITH =,
        decision_time WITH &&,
        transaction_time WITH &&
    ) DEFERRABLE INITIALLY IMMEDIATE,
    CHECK (LOWER(decision_time) <= LOWER(transaction_time))
);


CREATE
    OR REPLACE FUNCTION update_entity_version_trigger() RETURNS TRIGGER AS
$$
BEGIN
    SET CONSTRAINTS entity_temporal_metadata_overlapping DEFERRED;

    -- Insert a new version with the old decision time and the system time up until now
    INSERT INTO entity_temporal_metadata (
        web_id,
        entity_uuid,
        entity_edition_id,
        decision_time,
        transaction_time
    ) VALUES (
        OLD.web_id,
        OLD.entity_uuid,
        OLD.entity_edition_id,
        OLD.decision_time,
        tstzrange(lower(OLD.transaction_time), lower(NEW.transaction_time), '[)')
    );

    -- Insert a new version with the previous decision time until the new decision time
    INSERT INTO entity_temporal_metadata (
        web_id,
        entity_uuid,
        entity_edition_id,
        decision_time,
        transaction_time
    ) VALUES (
        OLD.web_id,
        OLD.entity_uuid,
        OLD.entity_edition_id,
        tstzrange(lower(OLD.decision_time), lower(NEW.decision_time), '[)'),
        NEW.transaction_time
    );

    RETURN NEW;
END
$$ VOLATILE LANGUAGE plpgsql;

CREATE TRIGGER update_entity_version_trigger
    BEFORE UPDATE ON "entity_temporal_metadata"
    FOR EACH ROW EXECUTE PROCEDURE "update_entity_version_trigger"();
