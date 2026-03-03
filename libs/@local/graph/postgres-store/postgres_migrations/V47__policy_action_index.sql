CREATE INDEX policy_action_action_policy ON policy_action (action_name, policy_id);

-- Optimize policy resolution for principal lookup (B-Tree for JOIN + actor_type filter)
CREATE INDEX idx_policy_edition_principal_actor ON policy_edition (principal_id, principal_type, actor_type);

-- Optimize team hierarchy traversal in policy resolution
CREATE INDEX idx_team_hierarchy_child ON team_hierarchy (child_id);

-- Note: transaction_time @> now() uses existing GIST index:
-- policy_edition_id_transaction_time_excl (id, transaction_time) USING gist
-- Note: role table sequential scans are often optimal due to hash join efficiency
