use core::{assert_matches::assert_matches, error::Error};

use hash_graph_authorization::policies::{
    action::ActionName,
    principal::{
        PrincipalId,
        role::{Role, RoleId, WebRoleId},
        team::TeamId,
    },
    store::{CreateWebParameter, PrincipalStore as _},
};
use hash_graph_postgres_store::permissions::{
    PrincipalError, RoleAssignmentStatus, RoleUnassignmentStatus,
};
use pretty_assertions::assert_eq;
use type_system::{
    knowledge::entity::id::EntityUuid,
    provenance::{ActorEntityUuid, ActorId, UserId},
    web::OwnedById,
};
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // First create a team to associate the role with
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;

    // Then create a role associated with the team
    let role_id = client.create_role(None, TeamId::Web(web_id)).await?;
    assert!(client.is_role(role_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_role_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // First create a team to associate the role with
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;

    // Then create a role with a specific ID
    let id = Uuid::new_v4();
    let role_id = client.create_role(Some(id), TeamId::Web(web_id)).await?;
    assert_eq!(role_id, RoleId::Web(WebRoleId::new(id)));
    assert!(client.is_role(role_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_role_with_nonexistent_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed([]).await?;

    // Try to create a role with a non-existent team
    let non_existent_team_id = TeamId::Web(OwnedById::new(Uuid::new_v4()));
    let result = client.create_role(None, non_existent_team_id).await;

    assert_matches!(
        result.expect_err("Creating a role with a non-existent team should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Team(non_existent_team_id)
    );

    Ok(())
}

#[tokio::test]
async fn get_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // First create a team to associate the role with
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;

    // Then create a role associated with the team
    let role_id = client.create_role(None, TeamId::Web(web_id)).await?;

    // Get the role and verify its details
    let role = client.get_role(role_id).await?.expect("Role should exist");
    match role {
        Role::Web(role) => {
            assert_eq!(RoleId::Web(role.id), role_id);
            assert_eq!(TeamId::Web(role.web_id), TeamId::Web(web_id));
        }
        Role::Subteam(_) => panic!("Role should be a web role"),
    }

    Ok(())
}

#[tokio::test]
async fn delete_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // First create a team to associate the role with
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;

    // Then create a role associated with the team
    let role_id = client.create_role(None, TeamId::Web(web_id)).await?;
    assert!(client.is_role(role_id).await?);

    // Delete the role
    client.delete_role(role_id).await?;
    assert!(!client.is_role(role_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_nonexistent_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed([]).await?;

    // Try to delete a non-existent role
    let non_existent_id = RoleId::Web(WebRoleId::new(Uuid::new_v4()));
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
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // Create a team, role, and user
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let role_id = client.create_role(None, TeamId::Web(web_id)).await?;
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
    assert!(roles.contains_key(&role_id));

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
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // Create a team and role
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let role_id = client.create_role(None, TeamId::Web(web_id)).await?;

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
    let (mut client, _actor_id) = db.seed([]).await?;

    // Create a user
    let user_id = client.create_user(None).await?;

    // Try to assign a non-existent role to the user
    let non_existent_role_id = RoleId::Web(WebRoleId::new(Uuid::new_v4()));
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
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // Create a team, role, and user
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let role_id = client.create_role(None, TeamId::Web(web_id)).await?;
    let user_id = client.create_user(None).await?;

    // Assign the role to the user
    client
        .assign_role_to_actor(ActorId::User(user_id), role_id)
        .await?;

    // Verify the role was assigned
    let roles = client.get_actor_roles(ActorId::User(user_id)).await?;
    assert!(roles.contains_key(&role_id));

    // Unassign the role from the user
    assert_matches!(
        client
            .unassign_role_from_actor(ActorId::User(user_id), role_id)
            .await?,
        RoleUnassignmentStatus::Unassigned
    );

    // Verify the role was unassigned
    let roles = client.get_actor_roles(ActorId::User(user_id)).await?;
    assert!(!roles.contains_key(&role_id));

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
    let (mut client, _actor_id) = db.seed([]).await?;

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
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // Create a team and role
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let role_id = client.create_role(None, TeamId::Web(web_id)).await?;

    // Get the role's actors (should be empty)
    let actors = client.get_role_actors(role_id).await?;
    assert!(actors.is_empty());

    Ok(())
}

#[tokio::test]
async fn create_web_team_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // Create a web team
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;

    // Create a role for the web team
    let role_id = client.create_role(None, TeamId::Web(web_id)).await?;

    // Verify the role was created properly
    let role = client.get_role(role_id).await?.expect("Role should exist");
    match role {
        Role::Web(web_role) => {
            assert_eq!(RoleId::Web(web_role.id), role_id);
            assert_eq!(web_role.web_id, web_id);
        }
        Role::Subteam(_) => panic!("Expected a web role"),
    }

    Ok(())
}

#[tokio::test]
async fn create_subteam_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // First create a parent team
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;

    // Create a subteam
    let subteam_id = client.create_subteam(None, TeamId::Web(web_id)).await?;

    // Create a role for the subteam
    let role_id = client
        .create_role(None, TeamId::Subteam(subteam_id))
        .await?;

    // Verify the role was created properly
    let role = client.get_role(role_id).await?.expect("Role should exist");
    match role {
        Role::Subteam(subteam_role) => {
            assert_eq!(RoleId::Subteam(subteam_role.id), role_id);
            assert_eq!(subteam_role.subteam_id, subteam_id);
        }
        Role::Web(_) => panic!("Expected a subteam role"),
    }

    Ok(())
}

#[tokio::test]
async fn assign_role_to_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // Create a web team, role, and machine
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let role_id = client.create_role(None, TeamId::Web(web_id)).await?;
    let machine_id = client.create_machine(None).await?;

    // Assign the role to the machine
    client
        .assign_role_to_actor(ActorId::Machine(machine_id), role_id)
        .await?;

    // Get the machine's roles
    let roles = client.get_actor_roles(ActorId::Machine(machine_id)).await?;
    assert!(roles.contains_key(&role_id));

    // Get the role's actors
    let actors = client.get_role_actors(role_id).await?;
    assert!(actors.contains(&ActorId::Machine(machine_id)));

    // Unassign the role from the machine
    client
        .unassign_role_from_actor(ActorId::Machine(machine_id), role_id)
        .await?;

    // Verify the role was unassigned
    let roles = client.get_actor_roles(ActorId::Machine(machine_id)).await?;
    assert!(!roles.contains_key(&role_id));

    Ok(())
}
