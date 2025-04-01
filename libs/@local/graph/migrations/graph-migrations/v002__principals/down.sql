-- Drop indexes (except those referenced by foreign keys)
DROP INDEX idx_actor_role_role_id;
DROP INDEX idx_actor_role_actor_id;
DROP INDEX idx_role_team_id;
DROP INDEX idx_team_hierarchy_child;
DROP INDEX idx_team_hierarchy_parent;
DROP INDEX idx_team_hierarchy_single_parent;

-- Drop relationship tables first
DROP TABLE actor_role;
DROP TABLE team_hierarchy;

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

DROP TRIGGER user_delete_trigger ON "user";
DROP TRIGGER user_register_trigger ON "user";
DROP FUNCTION register_user();
DROP TABLE "user";

-- Drop specialized team tables
DROP TRIGGER subteam_prevent_delete_trigger ON subteam;
DROP TRIGGER subteam_register_trigger ON subteam;
DROP FUNCTION register_subteam();
DROP TABLE subteam;

DROP TRIGGER web_prevent_delete_trigger ON web;
DROP TRIGGER web_register_trigger ON web;
DROP FUNCTION register_web();
DROP TABLE web;

-- Drop team triggers
DROP TRIGGER team_delete_trigger ON team;
DROP TRIGGER team_register_trigger ON team;
DROP FUNCTION register_team();
DROP TRIGGER enforce_direct_team_creation_trigger ON team;
DROP FUNCTION enforce_direct_team_creation();

-- Drop actor table and related items
DROP TRIGGER actor_delete_trigger ON actor;
DROP TRIGGER actor_register_trigger ON actor;
DROP FUNCTION register_actor();
DROP TRIGGER prevent_actor_modification ON actor;
DROP TABLE actor;

-- Drop team table
DROP TABLE team;

-- Drop principal table and related items
DROP TRIGGER prevent_principal_modification ON principal;
DROP TABLE principal;

-- Drop utility functions
DROP FUNCTION prevent_direct_delete_from_concrete();
DROP FUNCTION prevent_direct_modification();

-- Drop enum types
DROP TYPE PRINCIPAL_TYPE;
