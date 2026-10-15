ALTER TABLE entity_temporal_metadata
ADD CONSTRAINT entity_temporal_metadata_decision_time_nonempty CHECK (NOT isempty(decision_time)),
ADD CONSTRAINT entity_temporal_metadata_transaction_time_nonempty CHECK (NOT isempty(transaction_time));
