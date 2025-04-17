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

DROP TRIGGER machine_actor_delete_trigger ON machine_actor;
DROP TRIGGER machine_actor_register_trigger ON machine_actor;
DROP FUNCTION register_machine_actor();
DROP TABLE machine_actor;

DROP TRIGGER ai_actor_delete_trigger ON ai_actor;
DROP TRIGGER ai_actor_register_trigger ON ai_actor;
DROP FUNCTION register_ai_actor();
DROP TABLE ai_actor;

DROP TRIGGER user_actor_delete_trigger ON user_actor;
DROP TRIGGER user_actor_register_trigger ON user_actor;
DROP FUNCTION register_user_actor();
DROP TABLE user_actor;

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
