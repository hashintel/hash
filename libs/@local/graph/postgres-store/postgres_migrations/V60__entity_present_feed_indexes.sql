-- The update feed polls current rows by their transaction-time start. Every predicate it uses
-- is a function over a column, so only these partial expression indexes can serve it, one per
-- feed arm: present rows for `changed`, decision-closed current rows for `ended`.
CREATE INDEX entity_temporal_metadata_present_transaction_start
    ON entity_temporal_metadata (lower(transaction_time))
    WHERE draft_id IS NULL
        AND upper_inf(transaction_time)
        AND upper_inf(decision_time);

CREATE INDEX entity_temporal_metadata_closed_transaction_start
    ON entity_temporal_metadata (lower(transaction_time))
    WHERE draft_id IS NULL
        AND upper_inf(transaction_time)
        AND NOT upper_inf(decision_time);
