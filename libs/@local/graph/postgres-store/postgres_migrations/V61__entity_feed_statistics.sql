-- The feed predicates are expressions, which carry no column statistics, so without these
-- objects the planner sweeps every present row for the ended arm. The mcv object prices the
-- predicate combination both arms share, which bounds the ended arm's anti-join by the
-- candidate count. The expression object gives the transaction-time start a histogram, which
-- fixes the changed arm's cardinality. The bounded plan wins to roughly twenty thousand
-- candidates per poll window. A burst the statistics have not caught up with stretches it to
-- about four times the sweep at a hundred thousand candidates.
CREATE STATISTICS entity_temporal_metadata_transaction_start_stats
    ON lower(transaction_time) FROM entity_temporal_metadata;

CREATE STATISTICS entity_temporal_metadata_feed_stats (mcv)
    ON draft_id, upper_inf(transaction_time), upper_inf(decision_time)
    FROM entity_temporal_metadata;

-- A statistics object is empty until the table is analyzed. Populated stores get real
-- estimates at migration time; the bootstrap's tables are empty and analyze as they grow.
ANALYZE entity_temporal_metadata;
