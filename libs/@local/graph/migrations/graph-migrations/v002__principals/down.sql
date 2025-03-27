-- Drop indexes
DROP INDEX IF EXISTS idx_actor_role_role_id;
DROP INDEX IF EXISTS idx_actor_role_actor_id;
DROP INDEX IF EXISTS idx_role_team_id;
DROP INDEX IF EXISTS idx_team_hierarchy_child;
DROP INDEX IF EXISTS idx_team_hierarchy_parent;

-- Drop relationship tables first
DROP TABLE IF EXISTS actor_role;
DROP TABLE IF EXISTS team_hierarchy;

-- Drop concrete principal leaf tables
DROP TRIGGER IF EXISTS role_delete_trigger ON role;
DROP TRIGGER IF EXISTS role_register_trigger ON role;
DROP FUNCTION IF EXISTS register_role();
DROP TABLE IF EXISTS role;

DROP TRIGGER IF EXISTS machine_delete_trigger ON machine;
DROP TRIGGER IF EXISTS machine_register_trigger ON machine;
DROP FUNCTION IF EXISTS register_machine();
DROP TABLE IF EXISTS machine;

DROP TRIGGER IF EXISTS user_delete_trigger ON "user";
DROP TRIGGER IF EXISTS user_register_trigger ON "user";
DROP FUNCTION IF EXISTS register_user();
DROP TABLE IF EXISTS "user";

-- Drop specialized team tables
DROP TRIGGER IF EXISTS subteam_prevent_delete_trigger ON subteam;
DROP TRIGGER IF EXISTS subteam_register_trigger ON subteam;
DROP FUNCTION IF EXISTS register_subteam();
DROP TABLE IF EXISTS subteam;

DROP TRIGGER IF EXISTS web_prevent_delete_trigger ON web;
DROP TRIGGER IF EXISTS web_register_trigger ON web;
DROP FUNCTION IF EXISTS register_web();
DROP TABLE IF EXISTS web;

-- Drop team triggers
DROP TRIGGER IF EXISTS team_delete_trigger ON team;
DROP TRIGGER IF EXISTS team_register_trigger ON team;
DROP FUNCTION IF EXISTS register_team();
DROP TRIGGER IF EXISTS enforce_direct_team_creation_trigger ON team;
DROP FUNCTION IF EXISTS enforce_direct_team_creation();
DROP FUNCTION IF EXISTS prevent_team_hierarchy_cycles();

-- Drop actor table and related items
DROP TRIGGER IF EXISTS actor_delete_trigger ON actor;
DROP TRIGGER IF EXISTS actor_register_trigger ON actor;
DROP FUNCTION IF EXISTS register_actor();
DROP TRIGGER IF EXISTS prevent_actor_modification ON actor;
DROP TABLE IF EXISTS actor;

-- Drop team table
DROP TABLE IF EXISTS team;

-- Drop principal table and related items
DROP TRIGGER IF EXISTS prevent_principal_modification ON principal;
DROP TABLE IF EXISTS principal;

-- Drop utility functions
DROP FUNCTION IF EXISTS prevent_direct_delete_from_concrete();
DROP FUNCTION IF EXISTS prevent_direct_modification();

-- Drop enum types
DROP TYPE IF EXISTS TEAM_TYPE;
DROP TYPE IF EXISTS ACTOR_TYPE;
DROP TYPE IF EXISTS PRINCIPAL_TYPE;
