CREATE TYPE policy_effect AS ENUM ('permit', 'forbid');

CREATE TABLE IF NOT EXISTS action (
    name TEXT PRIMARY KEY,
    parent TEXT REFERENCES action (name) ON DELETE RESTRICT,
    CONSTRAINT no_self_parent CHECK (name != parent)
);

CREATE TABLE action_hierarchy (
    parent_name TEXT NOT NULL REFERENCES action (name) ON DELETE CASCADE,
    child_name TEXT NOT NULL REFERENCES action (name) ON DELETE CASCADE,
    depth INTEGER NOT NULL,
    CONSTRAINT depth_check CHECK (
        depth = 0 AND parent_name = child_name
        OR depth > 0 AND parent_name != child_name
    )
);

-- Create an index to efficiently find the primary parent (depth=1) for each action
CREATE UNIQUE INDEX idx_action_hierarchy_single_parent ON action_hierarchy (child_name)
WHERE depth = 1;

CREATE TABLE IF NOT EXISTS policy (
    id UUID PRIMARY KEY,
    name TEXT,

    effect POLICY_EFFECT NOT NULL,

    -- Principal references
    principal_id UUID,
    principal_type PRINCIPAL_TYPE,
    actor_type PRINCIPAL_TYPE,
    FOREIGN KEY (principal_id, principal_type) REFERENCES principal (id, principal_type),
    CONSTRAINT complete_principal CHECK ((principal_id IS NULL) = (principal_type IS NULL)),
    CONSTRAINT check_actor_type CHECK (actor_type IN ('user', 'machine', 'ai')),

    -- Resource specification
    resource_constraint JSONB
);

CREATE UNIQUE INDEX policy_unique_name_per_principal_idx
ON policy (name, principal_id, principal_type, actor_type) NULLS NOT DISTINCT
WHERE name IS NOT NULL;

-- Policy-Action junction table for multiple actions per policy
CREATE TABLE IF NOT EXISTS policy_action (
    policy_id UUID NOT NULL REFERENCES policy (id) ON DELETE CASCADE,
    action_name TEXT NOT NULL REFERENCES action (name) ON DELETE CASCADE,
    PRIMARY KEY (policy_id, action_name)
);
