-- Give the planner a histogram for the transaction-time cutoff and multivariate statistics for
-- the expression predicates shared by the feed arms.
CREATE STATISTICS entity_temporal_metadata_transaction_start_stats
    ON lower(transaction_time) FROM entity_temporal_metadata;

CREATE STATISTICS entity_temporal_metadata_feed_stats (mcv)
    ON draft_id, upper_inf(transaction_time), upper_inf(decision_time)
    FROM entity_temporal_metadata;

-- Populate the new statistics for existing stores.
ANALYZE entity_temporal_metadata;
