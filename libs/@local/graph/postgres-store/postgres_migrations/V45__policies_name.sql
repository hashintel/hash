ALTER TABLE policy ADD COLUMN name TEXT;

CREATE UNIQUE INDEX policy_unique_name_per_principal_idx
ON policy (name, principal_id, principal_type, actor_type) NULLS NOT DISTINCT
WHERE name IS NOT NULL;
