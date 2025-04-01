use core::{assert_matches::assert_matches, error::Error};

use hash_graph_authorization::policies::principal::{
    PrincipalId,
    role::{Role, RoleId},
    team::{StandaloneTeamId, StandaloneTeamRoleId, TeamId},
};
use hash_graph_postgres_store::permissions::{
    PrincipalError, RoleAssignmentStatus, RoleUnassignmentStatus,
};
use pretty_assertions::assert_eq;
use type_system::{
    knowledge::entity::id::EntityUuid,
    provenance::{ActorEntityUuid, ActorId, UserId},
};
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // First create a team to associate the role with
    let team_id = client.create_standalone_team(None).await?;

    // Then create a role associated with the team
    let role_id = client
        .create_role(None, TeamId::Standalone(team_id))
        .await?;
    assert!(client.is_role(role_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_role_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // First create a team to associate the role with
    let team_id = client.create_standalone_team(None).await?;

    // Then create a role with a specific ID
    let id = Uuid::new_v4();
    let role_id = client
        .create_role(Some(id), TeamId::Standalone(team_id))
        .await?;
    assert_eq!(role_id, RoleId::Standalone(StandaloneTeamRoleId::new(id)));
    assert!(client.is_role(role_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_role_with_nonexistent_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Try to create a role with a non-existent team
    let non_existent_team_id = StandaloneTeamId::new(Uuid::new_v4());
    let result = client
        .create_role(None, TeamId::Standalone(non_existent_team_id))
        .await;

    assert_matches!(
        result.expect_err("Creating a role with a non-existent team should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Team(TeamId::Standalone(non_existent_team_id))
    );

    Ok(())
}

#[tokio::test]
async fn get_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // First create a team to associate the role with
    let team_id = client.create_standalone_team(None).await?;

    // Then create a role associated with the team
    let role_id = client
        .create_role(None, TeamId::Standalone(team_id))
        .await?;

    // Get the role and verify its details
    let role = client.get_role(role_id).await?.expect("Role should exist");
    match role {
        Role::Standalone(role) => {
            assert_eq!(RoleId::Standalone(role.id), role_id);
            assert_eq!(
                TeamId::Standalone(role.team_id),
                TeamId::Standalone(team_id)
            );
        }
        _ => panic!("Role should be a standalone role"),
    }

    Ok(())
}

#[tokio::test]
async fn delete_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // First create a team to associate the role with
    let team_id = client.create_standalone_team(None).await?;

    // Then create a role associated with the team
    let role_id = client
        .create_role(None, TeamId::Standalone(team_id))
        .await?;
    assert!(client.is_role(role_id).await?);

    // Delete the role
    client.delete_role(role_id).await?;
    assert!(!client.is_role(role_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_nonexistent_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Try to delete a non-existent role
    let non_existent_id = RoleId::Standalone(StandaloneTeamRoleId::new(Uuid::new_v4()));
    let result = client.delete_role(non_existent_id).await;

    assert_matches!(
        result.expect_err("Deleting a non-existent role should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Role(non_existent_id)
    );

    Ok(())
}

#[tokio::test]
async fn assign_role_to_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a team, role, and user
    let team_id = client.create_standalone_team(None).await?;
    let role_id = client
        .create_role(None, TeamId::Standalone(team_id))
        .await?;
    let user_id = client.create_user(None).await?;

    // Assign the role to the user
    assert_matches!(
        client
            .assign_role_to_actor(ActorId::User(user_id), role_id)
            .await?,
        RoleAssignmentStatus::NewlyAssigned
    );

    // Get the user's roles
    let roles = client.get_actor_roles(ActorId::User(user_id)).await?;
    assert!(roles.contains(&role_id));

    // Get the role's actors
    let actors = client.get_role_actors(role_id).await?;
    assert!(actors.contains(&ActorId::User(user_id)));

    // Try to assign the same role again
    assert_matches!(
        client
            .assign_role_to_actor(ActorId::User(user_id), role_id)
            .await?,
        RoleAssignmentStatus::AlreadyAssigned
    );

    Ok(())
}

#[tokio::test]
async fn assign_role_to_nonexistent_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a team and role
    let team_id = client.create_standalone_team(None).await?;
    let role_id = client
        .create_role(None, TeamId::Standalone(team_id))
        .await?;

    // Try to assign the role to a non-existent user
    let non_existent_user_id = UserId::new(ActorEntityUuid::new(EntityUuid::new(Uuid::new_v4())));
    let result = client
        .assign_role_to_actor(ActorId::User(non_existent_user_id), role_id)
        .await;

    assert_matches!(
        result.expect_err("Assigning a role to a non-existent actor should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Actor(ActorId::User(non_existent_user_id))
    );

    Ok(())
}

#[tokio::test]
async fn assign_nonexistent_role_to_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a user
    let user_id = client.create_user(None).await?;

    // Try to assign a non-existent role to the user
    let non_existent_role_id = RoleId::Standalone(StandaloneTeamRoleId::new(Uuid::new_v4()));
    let result = client
        .assign_role_to_actor(ActorId::User(user_id), non_existent_role_id)
        .await;

    assert_matches!(
        result.expect_err("Assigning a non-existent role to an actor should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Role(non_existent_role_id)
    );

    Ok(())
}

#[tokio::test]
async fn unassign_role_from_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a team, role, and user
    let team_id = client.create_standalone_team(None).await?;
    let role_id = client
        .create_role(None, TeamId::Standalone(team_id))
        .await?;
    let user_id = client.create_user(None).await?;

    // Assign the role to the user
    client
        .assign_role_to_actor(ActorId::User(user_id), role_id)
        .await?;

    // Verify the role was assigned
    let roles = client.get_actor_roles(ActorId::User(user_id)).await?;
    assert!(roles.contains(&role_id));

    // Unassign the role from the user
    assert_matches!(
        client
            .unassign_role_from_actor(ActorId::User(user_id), role_id)
            .await?,
        RoleUnassignmentStatus::Unassigned
    );

    // Verify the role was unassigned
    let roles = client.get_actor_roles(ActorId::User(user_id)).await?;
    assert!(!roles.contains(&role_id));

    // Verify the actor was removed from the role
    let actors = client.get_role_actors(role_id).await?;
    assert!(!actors.contains(&ActorId::User(user_id)));

    // Try to unassign the role again
    assert_matches!(
        client
            .unassign_role_from_actor(ActorId::User(user_id), role_id)
            .await?,
        RoleUnassignmentStatus::NotAssigned
    );

    Ok(())
}

#[tokio::test]
async fn get_actor_roles_empty() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a user
    let user_id = client.create_user(None).await?;

    // Get the user's roles (should be empty)
    let roles = client.get_actor_roles(ActorId::User(user_id)).await?;
    assert!(roles.is_empty());

    Ok(())
}

#[tokio::test]
async fn get_role_actors_empty() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a team and role
    let team_id = client.create_standalone_team(None).await?;
    let role_id = client
        .create_role(None, TeamId::Standalone(team_id))
        .await?;

    // Get the role's actors (should be empty)
    let actors = client.get_role_actors(role_id).await?;
    assert!(actors.is_empty());

    Ok(())
}

#[tokio::test]
async fn create_web_team_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a web team
    let web_id = client.create_web(None).await?;

    // Create a role for the web team
    let role_id = client.create_role(None, TeamId::Web(web_id)).await?;

    // Verify the role was created properly
    let role = client.get_role(role_id).await?.expect("Role should exist");
    match role {
        Role::Web(web_role) => {
            assert_eq!(RoleId::Web(web_role.id), role_id);
            assert_eq!(web_role.web_id, web_id);
        }
        _ => panic!("Expected a web role"),
    }

    Ok(())
}

#[tokio::test]
async fn create_subteam_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // First create a parent team
    let parent_team_id = client.create_standalone_team(None).await?;

    // Create a subteam
    let subteam_id = client
        .create_subteam(None, TeamId::Standalone(parent_team_id))
        .await?;

    // Create a role for the subteam
    let role_id = client.create_role(None, TeamId::Sub(subteam_id)).await?;

    // Verify the role was created properly
    let role = client.get_role(role_id).await?.expect("Role should exist");
    match role {
        Role::Subteam(subteam_role) => {
            assert_eq!(RoleId::Subteam(subteam_role.id), role_id);
            assert_eq!(subteam_role.team_id, subteam_id);
        }
        _ => panic!("Expected a subteam role"),
    }

    Ok(())
}

#[tokio::test]
async fn assign_role_to_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a team, role, and machine
    let team_id = client.create_standalone_team(None).await?;
    let role_id = client
        .create_role(None, TeamId::Standalone(team_id))
        .await?;
    let machine_id = client.create_machine(None).await?;

    // Assign the role to the machine
    client
        .assign_role_to_actor(ActorId::Machine(machine_id), role_id)
        .await?;

    // Get the machine's roles
    let roles = client.get_actor_roles(ActorId::Machine(machine_id)).await?;
    assert!(roles.contains(&role_id));

    // Get the role's actors
    let actors = client.get_role_actors(role_id).await?;
    assert!(actors.contains(&ActorId::Machine(machine_id)));

    // Unassign the role from the machine
    client
        .unassign_role_from_actor(ActorId::Machine(machine_id), role_id)
        .await?;

    // Verify the role was unassigned
    let roles = client.get_actor_roles(ActorId::Machine(machine_id)).await?;
    assert!(!roles.contains(&role_id));

    Ok(())
}

#[tokio::test]
async fn comprehensive_team_role_hierarchy() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a web team (top level)
    let web_id = client.create_web(None).await?;
    let web_role_id = client.create_role(None, TeamId::Web(web_id)).await?;

    // Create a standalone team
    let standalone_id = client.create_standalone_team(None).await?;
    let standalone_role_id = client
        .create_role(None, TeamId::Standalone(standalone_id))
        .await?;

    // Create level 1 subteam under web team
    let subteam_l1_id = client.create_subteam(None, TeamId::Web(web_id)).await?;
    let _subteam_l1_role_id = client.create_role(None, TeamId::Sub(subteam_l1_id)).await?;

    // Create level 2 subteam under level 1 subteam
    let subteam_l2_id = client
        .create_subteam(None, TeamId::Sub(subteam_l1_id))
        .await?;
    let subteam_l2_role_id = client.create_role(None, TeamId::Sub(subteam_l2_id)).await?;

    // Create user and machine
    let user_id = client.create_user(None).await?;
    let machine_id = client.create_machine(None).await?;

    // Assign web role to user and machine
    client
        .assign_role_to_actor(ActorId::User(user_id), web_role_id)
        .await?;
    client
        .assign_role_to_actor(ActorId::Machine(machine_id), standalone_role_id)
        .await?;

    // Assign level 2 subteam role to user (this should give access to the entire hierarchy)
    client
        .assign_role_to_actor(ActorId::User(user_id), subteam_l2_role_id)
        .await?;

    // Verify user has the expected roles
    let user_roles = client.get_actor_roles(ActorId::User(user_id)).await?;
    assert!(user_roles.contains(&web_role_id));
    assert!(user_roles.contains(&subteam_l2_role_id));
    assert_eq!(user_roles.len(), 2); // Only the directly assigned roles

    // Get all user principals
    let user_principals = client.get_actor_principals(ActorId::User(user_id)).await?;

    // User should have access to:
    // 1. Themselves (ActorId::User)
    // 2. Web role
    // 3. Web team
    // 4. Subteam L2 role
    // 5. Subteam L2
    // 6. Subteam L1 (parent of L2)
    // Total: 6 principals

    assert!(user_principals.contains(&PrincipalId::Actor(ActorId::User(user_id))));
    assert!(user_principals.contains(&PrincipalId::Role(web_role_id)));
    assert!(user_principals.contains(&PrincipalId::Team(TeamId::Web(web_id))));
    assert!(user_principals.contains(&PrincipalId::Role(subteam_l2_role_id)));
    assert!(user_principals.contains(&PrincipalId::Team(TeamId::Sub(subteam_l2_id))));
    assert!(user_principals.contains(&PrincipalId::Team(TeamId::Sub(subteam_l1_id))));

    assert_eq!(
        user_principals.len(),
        6,
        "User should have 6 distinct principals"
    );

    // Verify the machine principals
    let machine_principals = client
        .get_actor_principals(ActorId::Machine(machine_id))
        .await?;

    // Machine should have access to:
    // 1. Itself (ActorId::Machine)
    // 2. Standalone role
    // 3. Standalone team
    // Total: 3 principals

    assert!(machine_principals.contains(&PrincipalId::Actor(ActorId::Machine(machine_id))));
    assert!(machine_principals.contains(&PrincipalId::Role(standalone_role_id)));
    assert!(machine_principals.contains(&PrincipalId::Team(TeamId::Standalone(standalone_id))));

    assert_eq!(
        machine_principals.len(),
        3,
        "Machine should have 3 distinct principals"
    );

    Ok(())
}
