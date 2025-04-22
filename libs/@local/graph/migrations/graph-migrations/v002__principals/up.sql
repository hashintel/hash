-- ==========================================
-- PRINCIPALS SCHEMA
-- ==========================================
--
-- This schema implements the authorization model combining teams and principal entities.
-- It uses table inheritance with shared primary keys to model entity relationships.
--
-- Design patterns:
-- 1. Single-table inheritance: Concrete entities share primary keys with parent entities
-- 2. Abstract table enforcement: Prevent direct manipulation of abstract base tables
-- 3. Deletion management: Delete from parent tables to cascade properly
-- 4. Trigger-based integrity: To maintain relationships between entities
--
-- Major hierarchies:
-- 1. Group Hierarchy: actor_group → web/team + team_hierarchy relationships
-- 2. Principal Hierarchy: principal → actor/group, actor → user/machine/ai, principal → role
--
-- NOTE: All groups are also principals, allowing them to be subjects in authorization

-- ==========================================
-- UTILITY FUNCTIONS
-- ==========================================

-- Function to prevent direct modifications of abstract tables
CREATE FUNCTION prevent_direct_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Direct modification of abstract table % is not allowed. Use concrete types instead.', TG_TABLE_NAME;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to prevent direct deletion from concrete tables
-- This enforces deletion through the principal table for proper hierarchy management
CREATE FUNCTION prevent_direct_delete_from_concrete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Direct deletion from concrete % tables is not allowed. Delete from principal table instead.', TG_TABLE_NAME;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- PRINCIPAL TABLE - ROOT LEVEL
-- ==========================================

-- Principal is the abstract base type for all security principals
-- It has concrete subtypes: user_actor, machine_actor, ai_actor, web, team, role.
-- The principal type is used to determine the type of the principal.
CREATE TYPE principal_type AS ENUM (
    'user', 'machine', 'ai', 'web', 'team', 'web_role', 'team_role'
);
CREATE TABLE principal (
    id UUID NOT NULL,
    principal_type PRINCIPAL_TYPE NOT NULL,
    PRIMARY KEY (id, principal_type)
);

-- Prevent direct operations on principal (abstract) table
-- Only allow modifications through triggers (pg_trigger_depth > 0)
CREATE TRIGGER prevent_principal_modification
BEFORE INSERT OR UPDATE ON principal
FOR EACH ROW WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION prevent_direct_modification();

-- ==========================================
-- ACTOR TABLE - INTERMEDIATE LEVEL
-- ==========================================

-- Actor is a subtype of principal that represents entities that can perform actions
-- It's the parent table for user_actor, machine_actor, and ai_actor concrete types
CREATE TABLE actor (
    id UUID PRIMARY KEY,
    principal_type PRINCIPAL_TYPE NOT NULL,
    FOREIGN KEY (id, principal_type) REFERENCES principal (id, principal_type) ON DELETE CASCADE,
    CHECK (principal_type IN ('user', 'machine', 'ai'))
);

CREATE UNIQUE INDEX idx_actor_id ON actor (id);


-- Prevent direct operations on actor (abstract) table
CREATE TRIGGER prevent_actor_modification
BEFORE INSERT OR UPDATE OR DELETE ON actor
FOR EACH ROW WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION prevent_direct_modification();

-- Create a trigger to automatically create a principal record when an actor is created
CREATE FUNCTION register_actor()
RETURNS TRIGGER AS $$
BEGIN
    -- Create principal record for the actor
    INSERT INTO principal (id, principal_type)
    VALUES (NEW.id, NEW.principal_type);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER actor_register_trigger
BEFORE INSERT ON actor
FOR EACH ROW EXECUTE FUNCTION register_actor();

-- When an actor is deleted directly, prevent it (should delete from principal instead)
CREATE TRIGGER actor_delete_trigger
BEFORE DELETE ON actor
FOR EACH ROW WHEN (pg_trigger_depth() = 0)  -- Only prevent direct deletions, allow cascaded ones
EXECUTE FUNCTION prevent_direct_delete_from_concrete();

-- ==========================================
-- TEAM TABLE - INTERMEDIATE LEVEL
-- ==========================================

-- Team is a concrete principal that represents a group of users/machines
CREATE TABLE actor_group (
    id UUID PRIMARY KEY,
    principal_type PRINCIPAL_TYPE NOT NULL,
    FOREIGN KEY (id, principal_type) REFERENCES principal (id, principal_type) ON DELETE CASCADE,
    CHECK (principal_type IN ('web', 'team'))
);

-- Prevent direct operations on actor_group (abstract) table
CREATE TRIGGER prevent_team_modification
BEFORE INSERT OR UPDATE OR DELETE ON actor_group
FOR EACH ROW WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION prevent_direct_modification();

-- Create a trigger to automatically create a principal record when an actor group is created
CREATE FUNCTION register_actor_group()
RETURNS TRIGGER AS $$
BEGIN
    -- Create the principal record with the actor group's ID and principal_type
    INSERT INTO principal (id, principal_type)
    VALUES (NEW.id, NEW.principal_type);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER actor_group_register_trigger
BEFORE INSERT ON actor_group
FOR EACH ROW EXECUTE FUNCTION register_actor_group();

-- Actor group deletion trigger - prevents direct deletion from actor group table
CREATE TRIGGER actor_group_delete_trigger
BEFORE DELETE ON actor_group
FOR EACH ROW WHEN (pg_trigger_depth() = 0)  -- Only prevent direct deletions, allow cascaded ones
EXECUTE FUNCTION prevent_direct_delete_from_concrete();

-- ==========================================
-- WEB - SPECIALIZED ACTOR GROUP
-- ==========================================

-- Web is a specialized actor group that represents a top-level entity in our system
CREATE TABLE web (
    id UUID PRIMARY KEY REFERENCES actor_group (id) ON DELETE CASCADE
);

-- Web registration trigger - creates actor group record when web is created
CREATE FUNCTION register_web()
RETURNS TRIGGER AS $$
BEGIN
    -- Create actor group record with the same ID and web type
    INSERT INTO actor_group (id, principal_type) VALUES (NEW.id, 'web');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER web_register_trigger
BEFORE INSERT ON web
FOR EACH ROW EXECUTE FUNCTION register_web();

-- Web deletion prevention trigger - prevents direct deletion from web
CREATE TRIGGER web_prevent_delete_trigger
BEFORE DELETE ON web
FOR EACH ROW WHEN (pg_trigger_depth() = 0)  -- Only prevent direct deletions, allow cascaded ones
EXECUTE FUNCTION prevent_direct_delete_from_concrete();

-- ==========================================
-- TEAM - SPECIALIZED ACTOR GROUP
-- ==========================================

-- Team is a actor group that must have at least one parent
CREATE TABLE team (
    id UUID PRIMARY KEY REFERENCES actor_group (id) ON DELETE CASCADE,
    parent_id UUID NOT NULL REFERENCES actor_group (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_team_id ON team (id);

-- Team registration trigger - creates actor group record when team is created
CREATE FUNCTION register_team()
RETURNS TRIGGER AS $$
BEGIN
    -- Create actor group record with the same ID and team type
    INSERT INTO actor_group (id, principal_type) VALUES (NEW.id, 'team');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_register_trigger
BEFORE INSERT ON team
FOR EACH ROW EXECUTE FUNCTION register_team();

-- Team deletion prevention trigger - prevents direct deletion from team
CREATE TRIGGER team_prevent_delete_trigger
BEFORE DELETE ON team
FOR EACH ROW WHEN (pg_trigger_depth() = 0)  -- Only prevent direct deletions, allow cascaded ones
EXECUTE FUNCTION prevent_direct_delete_from_concrete();

-- ==========================================
-- TEAM HIERARCHY - RELATIONSHIPS
-- ==========================================

-- Team hierarchy represents parent-child relationships between teams
-- This allows teams to have multiple parents, forming a directed acyclic graph
CREATE TABLE team_hierarchy (
    parent_id UUID NOT NULL REFERENCES actor_group (id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES team (id) ON DELETE CASCADE,
    depth INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT no_self_parent CHECK (parent_id != child_id),
    CONSTRAINT non_negative_depth CHECK (depth > 0)
);

-- Create an index to efficiently find the primary parent (depth=1) for each team
CREATE UNIQUE INDEX idx_team_hierarchy_single_parent ON team_hierarchy (
    child_id
) WHERE (depth = 1);

-- ==========================================
-- CONCRETE PRINCIPAL TABLES - LEAF LEVEL
-- ==========================================

-- ---------------
-- user_actor
-- ---------------
-- A concrete principal and actor
-- The relationship chain: user_actor → actor → principal
CREATE TABLE user_actor (
    id UUID PRIMARY KEY REFERENCES actor (id) ON DELETE CASCADE
);

-- user_actor registration trigger - creates actor record when user_actor is created
CREATE FUNCTION register_user_actor()
RETURNS TRIGGER AS $$
BEGIN
    -- Create intermediate actor record with the same ID
    -- This will automatically create a principal record via the actor_register_trigger
    INSERT INTO actor (id, principal_type) VALUES (NEW.id, 'user');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_actor_register_trigger
BEFORE INSERT ON user_actor
FOR EACH ROW EXECUTE FUNCTION register_user_actor();

-- user_actor deletion trigger - prevents direct deletion from user_actor table
CREATE TRIGGER user_actor_delete_trigger
BEFORE DELETE ON user_actor
FOR EACH ROW WHEN (pg_trigger_depth() = 0)  -- Only prevent direct deletions, allow cascaded ones
EXECUTE FUNCTION prevent_direct_delete_from_concrete();

-- ---------------
-- machine_actor
-- ---------------
-- A concrete principal and actor
-- The relationship chain: machine_actor → actor → principal
CREATE TABLE machine_actor (
    id UUID PRIMARY KEY REFERENCES actor (id) ON DELETE CASCADE
);

-- machine_actor registration trigger - creates actor record when machine_actor is created
CREATE FUNCTION register_machine_actor()
RETURNS TRIGGER AS $$
BEGIN
    -- Create intermediate actor record with the same ID
    -- This will automatically create a principal record via the actor_register_trigger
    INSERT INTO actor (id, principal_type) VALUES (NEW.id, 'machine');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER machine_actor_register_trigger
BEFORE INSERT ON machine_actor
FOR EACH ROW EXECUTE FUNCTION register_machine_actor();

-- machine_actor deletion trigger - prevents direct deletion from machine_actor table
CREATE TRIGGER machine_actor_delete_trigger
BEFORE DELETE ON machine_actor
FOR EACH ROW WHEN (pg_trigger_depth() = 0)  -- Only prevent direct deletions, allow cascaded ones
EXECUTE FUNCTION prevent_direct_delete_from_concrete();

-- ---------------
-- AI
-- ---------------
-- A concrete principal and actor
-- The relationship chain: ai_actor → actor → principal
CREATE TABLE ai_actor (
    id UUID PRIMARY KEY REFERENCES actor (id) ON DELETE CASCADE
);

-- ai_actor registration trigger - creates actor record when ai_actor is created
CREATE FUNCTION register_ai_actor()
RETURNS TRIGGER AS $$
BEGIN
    -- Create intermediate actor record with the same ID
    -- This will automatically create a principal record via the actor_register_trigger
    INSERT INTO actor (id, principal_type) VALUES (NEW.id, 'ai');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_actor_register_trigger
BEFORE INSERT ON ai_actor
FOR EACH ROW EXECUTE FUNCTION register_ai_actor();

-- ai_actor deletion trigger - prevents direct deletion from ai_actor table
CREATE TRIGGER ai_actor_delete_trigger
BEFORE DELETE ON ai_actor
FOR EACH ROW WHEN (pg_trigger_depth() = 0)  -- Only prevent direct deletions, allow cascaded ones
EXECUTE FUNCTION prevent_direct_delete_from_concrete();

-- ---------------
-- Role
-- ---------------
-- Role is a concrete principal
-- The relationship chain: role → principal
CREATE TABLE role (
    id UUID NOT NULL,
    principal_type PRINCIPAL_TYPE NOT NULL,
    actor_group_id UUID NOT NULL REFERENCES actor_group (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    PRIMARY KEY (id, principal_type),
    FOREIGN KEY (id, principal_type) REFERENCES principal (id, principal_type) ON DELETE CASCADE,
    CHECK (principal_type IN ('web_role', 'team_role'))
);

CREATE UNIQUE INDEX idx_role_id ON role (id);

-- Role registration trigger - creates principal record when role is created
CREATE FUNCTION register_role()
RETURNS TRIGGER AS $$
BEGIN
    -- Create parent principal record with the same ID
    INSERT INTO principal (id, principal_type) VALUES (NEW.id, NEW.principal_type);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER role_register_trigger
BEFORE INSERT ON role
FOR EACH ROW EXECUTE FUNCTION register_role();

-- Role deletion trigger - prevents direct deletion from role table
CREATE TRIGGER role_delete_trigger
BEFORE DELETE ON role
FOR EACH ROW WHEN (pg_trigger_depth() = 0)  -- Only prevent direct deletions, allow cascaded ones
EXECUTE FUNCTION prevent_direct_delete_from_concrete();

-- ==========================================
-- RELATIONSHIP TABLES
-- ==========================================

-- Actor-Role assignments
-- This junction table implements the many-to-many relationship
-- between actors and roles
CREATE TABLE actor_role (
    actor_id UUID NOT NULL REFERENCES actor (id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES role (id) ON DELETE CASCADE,
    PRIMARY KEY (actor_id, role_id)
);
