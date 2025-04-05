-- Drop policy-action junction table
DROP TABLE policy_action;

-- Drop policy table
DROP TABLE policy;

-- Drop action table (with cascading delete for hierarchy)
DROP TABLE action_hierarchy;
DROP TABLE action;

-- Drop enum types
DROP TYPE POLICY_EFFECT;
