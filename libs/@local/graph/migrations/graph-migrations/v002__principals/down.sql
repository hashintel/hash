-- Drop indexes (except those referenced by foreign keys)
DROP INDEX idx_actor_role_role_id;
DROP INDEX idx_actor_role_actor_id;
DROP INDEX idx_role_actor_group_id;
DROP INDEX idx_actor_group_hierarchy_child;
DROP INDEX idx_actor_group_hierarchy_parent;
DROP INDEX idx_actor_group_hierarchy_single_parent;

-- Drop relationship tables first
DROP TABLE actor_role;
DROP TABLE actor_group_hierarchy;

-- Now it's safe to drop the remaining indexes
DROP INDEX idx_role_id;

-- Drop concrete principal leaf tables
DROP TRIGGER role_delete_trigger ON role;
DROP TRIGGER role_register_trigger ON role;
DROP FUNCTION register_role();
DROP TABLE role;

DROP TRIGGER machine_delete_trigger ON machine;
DROP TRIGGER machine_register_trigger ON machine;
DROP FUNCTION register_machine();
DROP TABLE machine;

DROP TRIGGER ai_delete_trigger ON ai;
DROP TRIGGER ai_register_trigger ON ai;
DROP FUNCTION register_ai();
DROP TABLE ai;

DROP TRIGGER user_delete_trigger ON "user";
DROP TRIGGER user_register_trigger ON "user";
DROP FUNCTION register_user();
DROP TABLE "user";

-- Drop specialized actor group tables
DROP TRIGGER team_prevent_delete_trigger ON team;
DROP TRIGGER team_register_trigger ON team;
DROP FUNCTION register_team();
DROP TABLE team;

DROP TRIGGER web_prevent_delete_trigger ON web;
DROP TRIGGER web_register_trigger ON web;
DROP FUNCTION register_web();
DROP TABLE web;

-- Drop actor group triggers
DROP TRIGGER actor_group_delete_trigger ON actor_group;
DROP TRIGGER actor_group_register_trigger ON actor_group;
DROP FUNCTION register_actor_group();

-- Drop actor group table
DROP TABLE actor_group;

-- Drop actor table and related items
DROP TRIGGER actor_delete_trigger ON actor;
DROP TRIGGER actor_register_trigger ON actor;
DROP FUNCTION register_actor();
DROP TRIGGER prevent_actor_modification ON actor;
DROP TABLE actor;

-- Drop principal table and related items
DROP TRIGGER prevent_principal_modification ON principal;
DROP TABLE principal;

-- Drop utility functions
DROP FUNCTION prevent_direct_delete_from_concrete();
DROP FUNCTION prevent_direct_modification();

-- Drop enum types
DROP TYPE PRINCIPAL_TYPE;
