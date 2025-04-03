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
-- 1. Team Hierarchy: team → web/subteam + team_hierarchy relationships
-- 2. Principal Hierarchy: principal → actor/team, actor → user/machine, principal → role
--
-- NOTE: All teams are also principals, allowing them to be subjects in authorization

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
-- It has concrete subtypes: user, machine, ai, team, role
CREATE TYPE principal_type AS ENUM (
    'user', 'machine', 'ai', 'web', 'subteam', 'web_role', 'subteam_role'
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
-- It's the parent table for user, machine, and ai concrete types
CREATE TABLE actor (
    id UUID PRIMARY KEY,
    principal_type PRINCIPAL_TYPE NOT NULL,
    FOREIGN KEY (id, principal_type) REFERENCES principal (id, principal_type) ON DELETE CASCADE,
    CHECK (principal_type IN ('user', 'machine', 'ai'))
);

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
CREATE TABLE team (
    id UUID PRIMARY KEY,
    principal_type PRINCIPAL_TYPE NOT NULL,
    FOREIGN KEY (id, principal_type) REFERENCES principal (id, principal_type) ON DELETE CASCADE,
    CHECK (principal_type IN ('web', 'subteam'))
);

-- Prevent direct operations on team (abstract) table
CREATE TRIGGER prevent_team_modification
BEFORE INSERT OR UPDATE OR DELETE ON team
FOR EACH ROW WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION prevent_direct_modification();

-- Create a trigger to automatically create a principal record when a team is created
CREATE FUNCTION register_team()
RETURNS TRIGGER AS $$
BEGIN
    -- Create the principal record with the team's ID and principal_type
    INSERT INTO principal (id, principal_type)
    VALUES (NEW.id, NEW.principal_type);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_register_trigger
BEFORE INSERT ON team
FOR EACH ROW EXECUTE FUNCTION register_team();

-- Team deletion trigger - prevents direct deletion from team table
CREATE TRIGGER team_delete_trigger
BEFORE DELETE ON team
FOR EACH ROW WHEN (pg_trigger_depth() = 0)  -- Only prevent direct deletions, allow cascaded ones
EXECUTE FUNCTION prevent_direct_delete_from_concrete();

-- ==========================================
-- WEB - SPECIALIZED TEAM
-- ==========================================

-- Web is a specialized team that represents a top-level entity in our system
CREATE TABLE web (
    id UUID PRIMARY KEY REFERENCES team (id) ON DELETE CASCADE
);

-- Web registration trigger - creates team record when web is created
CREATE FUNCTION register_web()
RETURNS TRIGGER AS $$
BEGIN
    -- Create team record with the same ID and web type
    INSERT INTO team (id, principal_type) VALUES (NEW.id, 'web');
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
-- SUBTEAM - SPECIALIZED TEAM
-- ==========================================

-- SubTeam is a team that must have at least one parent
CREATE TABLE subteam (
    id UUID PRIMARY KEY REFERENCES team (id) ON DELETE CASCADE,
    parent_id UUID NOT NULL REFERENCES team (id) ON DELETE CASCADE
);

-- SubTeam registration trigger - creates team record when subteam is created
CREATE FUNCTION register_subteam()
RETURNS TRIGGER AS $$
BEGIN
    -- Create team record with the same ID and subteam type
    INSERT INTO team (id, principal_type) VALUES (NEW.id, 'subteam');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subteam_register_trigger
BEFORE INSERT ON subteam
FOR EACH ROW EXECUTE FUNCTION register_subteam();

-- SubTeam deletion prevention trigger - prevents direct deletion from subteam
CREATE TRIGGER subteam_prevent_delete_trigger
BEFORE DELETE ON subteam
FOR EACH ROW WHEN (pg_trigger_depth() = 0)  -- Only prevent direct deletions, allow cascaded ones
EXECUTE FUNCTION prevent_direct_delete_from_concrete();

-- ==========================================
-- TEAM HIERARCHY - RELATIONSHIPS
-- ==========================================

-- Team hierarchy represents parent-child relationships between teams
-- This allows teams to have multiple parents, forming a directed acyclic graph
CREATE TABLE team_hierarchy (
    parent_id UUID NOT NULL REFERENCES team (id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES subteam (id) ON DELETE CASCADE,
    depth INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT no_self_parent CHECK (parent_id != child_id),
    CONSTRAINT non_negative_depth CHECK (depth > 0)
);

-- Create an index to efficiently find the primary parent (depth=1) for each subteam
CREATE UNIQUE INDEX idx_team_hierarchy_single_parent ON team_hierarchy (child_id) WHERE (depth = 1);

-- ==========================================
-- CONCRETE PRINCIPAL TABLES - LEAF LEVEL
-- ==========================================

-- ---------------
-- User
-- ---------------
-- User is a concrete principal and actor
-- The relationship chain: user → actor → principal
CREATE TABLE "user" (
    id UUID PRIMARY KEY REFERENCES actor (id) ON DELETE CASCADE
    -- User-specific fields can be added here
);

-- User registration trigger - creates actor record when user is created
CREATE FUNCTION register_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Create intermediate actor record with the same ID
    -- This will automatically create a principal record via the actor_register_trigger
    INSERT INTO actor (id, principal_type) VALUES (NEW.id, 'user');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_register_trigger
BEFORE INSERT ON "user"
FOR EACH ROW EXECUTE FUNCTION register_user();

-- User deletion trigger - prevents direct deletion from user table
CREATE TRIGGER user_delete_trigger
BEFORE DELETE ON "user"
FOR EACH ROW WHEN (pg_trigger_depth() = 0)  -- Only prevent direct deletions, allow cascaded ones
EXECUTE FUNCTION prevent_direct_delete_from_concrete();

-- ---------------
-- Machine
-- ---------------
-- Machine is a concrete principal and actor
-- The relationship chain: machine → actor → principal
CREATE TABLE machine (
    id UUID PRIMARY KEY REFERENCES actor (id) ON DELETE CASCADE
    -- Machine-specific fields can be added here
);

-- Machine registration trigger - creates actor record when machine is created
CREATE FUNCTION register_machine()
RETURNS TRIGGER AS $$
BEGIN
    -- Create intermediate actor record with the same ID
    -- This will automatically create a principal record via the actor_register_trigger
    INSERT INTO actor (id, principal_type) VALUES (NEW.id, 'machine');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER machine_register_trigger
BEFORE INSERT ON machine
FOR EACH ROW EXECUTE FUNCTION register_machine();

-- Machine deletion trigger - prevents direct deletion from machine table
CREATE TRIGGER machine_delete_trigger
BEFORE DELETE ON machine
FOR EACH ROW WHEN (pg_trigger_depth() = 0)  -- Only prevent direct deletions, allow cascaded ones
EXECUTE FUNCTION prevent_direct_delete_from_concrete();

-- ---------------
-- AI
-- ---------------
-- AI is a concrete principal and actor
-- The relationship chain: ai → actor → principal
CREATE TABLE ai (
    id UUID PRIMARY KEY REFERENCES actor (id) ON DELETE CASCADE
    -- AI-specific fields can be added here
);

-- AI registration trigger - creates actor record when ai is created
CREATE FUNCTION register_ai()
RETURNS TRIGGER AS $$
BEGIN
    -- Create intermediate actor record with the same ID
    -- This will automatically create a principal record via the actor_register_trigger
    INSERT INTO actor (id, principal_type) VALUES (NEW.id, 'ai');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_register_trigger
BEFORE INSERT ON ai
FOR EACH ROW EXECUTE FUNCTION register_ai();

-- AI deletion trigger - prevents direct deletion from ai table
CREATE TRIGGER ai_delete_trigger
BEFORE DELETE ON ai
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
    team_id UUID NOT NULL REFERENCES team (id) ON DELETE CASCADE,
    PRIMARY KEY (id, principal_type),
    FOREIGN KEY (id, principal_type) REFERENCES principal (id, principal_type) ON DELETE CASCADE,
    CHECK (principal_type IN ('web_role', 'subteam_role'))
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

-- ==========================================
-- INDEXES
-- ==========================================

-- Indexes for team hierarchy queries
-- These improve performance when looking up relationships
CREATE INDEX idx_team_hierarchy_parent ON team_hierarchy (parent_id);
CREATE INDEX idx_team_hierarchy_child ON team_hierarchy (child_id);

-- Indexes for roles and role assignments
CREATE INDEX idx_role_team_id ON role (team_id);
CREATE INDEX idx_actor_role_actor_id ON actor_role (actor_id);
CREATE INDEX idx_actor_role_role_id ON actor_role (role_id);
