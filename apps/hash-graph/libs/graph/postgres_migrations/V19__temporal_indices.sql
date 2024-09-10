CREATE INDEX entity_temporal_metadata_temporal_idx
    ON entity_temporal_metadata
        USING gist (web_id, entity_uuid, transaction_time, decision_time);
