use core::{assert_matches::assert_matches, error::Error};

use hash_graph_authorization::policies::principal::{
    team::{StandaloneTeamId, StandaloneTeamRoleId},
    user::UserId,
};
use hash_graph_postgres_store::permissions::PrincipalError;
use pretty_assertions::assert_eq;
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_team_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    let role_id = client.create_team_role(team_id, None).await?;

    assert!(client.is_team_role(role_id).await?);

    let (retrieved_role_id, retrieved_team_id) = client.get_team_role(role_id).await?;
    assert_eq!(retrieved_role_id, role_id);
    assert_eq!(retrieved_team_id, team_id);

    Ok(())
}

#[tokio::test]
async fn create_team_role_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    let id = Uuid::new_v4();
    let role_id = client.create_team_role(team_id, Some(id)).await?;

    assert_eq!(role_id, StandaloneTeamRoleId::new(id));
    assert!(client.is_team_role(role_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_team_role_with_non_existent_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let non_existent_team_id = StandaloneTeamId::new(Uuid::new_v4());
    let result = client.create_team_role(non_existent_team_id, None).await;

    assert_matches!(
        result.expect_err("Creating a role with non-existent team ID should fail").current_context(),
        PrincipalError::StandaloneTeamNotFound { id } if *id == non_existent_team_id
    );

    Ok(())
}

#[tokio::test]
async fn create_team_role_with_duplicate_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    let role_id = client.create_team_role(team_id, None).await?;
    let result = client
        .create_team_role(team_id, Some(*role_id.as_uuid()))
        .await;

    assert_matches!(
        result.expect_err("Creating a role with duplicate ID should fail").current_context(),
        PrincipalError::PrincipalAlreadyExists { id } if id == role_id.as_uuid()
    );

    Ok(())
}

#[tokio::test]
async fn get_team_roles() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    let role_id1 = client.create_team_role(team_id, None).await?;
    let role_id2 = client.create_team_role(team_id, None).await?;

    let roles = client.get_team_roles(team_id).await?;
    assert_eq!(roles.len(), 2);
    assert!(roles.contains(&role_id1));
    assert!(roles.contains(&role_id2));

    Ok(())
}

#[tokio::test]
async fn get_team_roles_for_non_existent_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let client = db.client().await?;

    let non_existent_team_id = StandaloneTeamId::new(Uuid::new_v4());
    let result = client.get_team_roles(non_existent_team_id).await;

    assert_matches!(
        result.expect_err("Getting roles for non-existent team should fail").current_context(),
        PrincipalError::StandaloneTeamNotFound { id } if *id == non_existent_team_id
    );

    Ok(())
}

#[tokio::test]
async fn delete_team_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    let role_id = client.create_team_role(team_id, None).await?;
    assert!(client.is_team_role(role_id).await?);

    client.delete_team_role(role_id).await?;
    assert!(!client.is_team_role(role_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_non_existent_team_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let non_existent_role_id = StandaloneTeamRoleId::new(Uuid::new_v4());
    let result = client.delete_team_role(non_existent_role_id).await;

    assert_matches!(
        result.expect_err("Deleting a non-existent role should fail").current_context(),
        PrincipalError::TeamRoleNotFound { id } if *id == non_existent_role_id
    );

    Ok(())
}

#[tokio::test]
async fn assign_role_to_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    let role_id = client.create_team_role(team_id, None).await?;
    let (user_id, _) = client.create_user(None).await?;

    client
        .assign_role_to_actor(*user_id.as_uuid(), role_id)
        .await?;
    assert!(client.actor_has_role(*user_id.as_uuid(), role_id).await?);

    Ok(())
}

#[tokio::test]
async fn assign_non_existent_role_to_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let (user_id, _) = client.create_user(None).await?;
    let non_existent_role_id = StandaloneTeamRoleId::new(Uuid::new_v4());
    let result = client
        .assign_role_to_actor(*user_id.as_uuid(), non_existent_role_id)
        .await;

    assert_matches!(
        result.expect_err("Assigning a non-existent role should fail").current_context(),
        PrincipalError::TeamRoleNotFound { id } if *id == non_existent_role_id
    );

    Ok(())
}

#[tokio::test]
async fn assign_role_to_actor_twice() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    let role_id = client.create_team_role(team_id, None).await?;
    let (user_id, _) = client.create_user(None).await?;

    client
        .assign_role_to_actor(*user_id.as_uuid(), role_id)
        .await?;
    let result = client
        .assign_role_to_actor(*user_id.as_uuid(), role_id)
        .await;

    assert_matches!(
        result.expect_err("Assigning the same role twice should fail").current_context(),
        PrincipalError::RoleAlreadyExists { actor_id, role_id: role_uuid }
        if actor_id == user_id.as_uuid() && role_uuid == role_id.as_uuid()
    );

    Ok(())
}

#[tokio::test]
async fn remove_role_from_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    let role_id = client.create_team_role(team_id, None).await?;
    let (user_id, _) = client.create_user(None).await?;

    client
        .assign_role_to_actor(*user_id.as_uuid(), role_id)
        .await?;
    assert!(client.actor_has_role(*user_id.as_uuid(), role_id).await?);

    client
        .remove_role_from_actor(*user_id.as_uuid(), role_id)
        .await?;
    assert!(!client.actor_has_role(*user_id.as_uuid(), role_id).await?);

    Ok(())
}

#[tokio::test]
async fn remove_non_existent_role_from_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let (user_id, _) = client.create_user(None).await?;
    let team_id = client.create_standalone_team(None).await?;
    let role_id = client.create_team_role(team_id, None).await?;

    let result = client
        .remove_role_from_actor(*user_id.as_uuid(), role_id)
        .await;

    assert_matches!(
        result.expect_err("Removing a non-existent role assignment should fail").current_context(),
        PrincipalError::RoleAlreadyAssigned { actor_id, role_id: role_uuid }
        if actor_id == user_id.as_uuid() && role_uuid == role_id.as_uuid()
    );

    Ok(())
}

#[tokio::test]
async fn get_actor_roles() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    let role_id1 = client.create_team_role(team_id, None).await?;
    let role_id2 = client.create_team_role(team_id, None).await?;
    let (user_id, _) = client.create_user(None).await?;

    // Initially the user has no roles
    let roles = client.get_actor_roles(*user_id.as_uuid()).await?;
    assert!(roles.is_empty());

    // Assign two roles
    client
        .assign_role_to_actor(*user_id.as_uuid(), role_id1)
        .await?;
    client
        .assign_role_to_actor(*user_id.as_uuid(), role_id2)
        .await?;

    // Now the user should have both roles
    let roles = client.get_actor_roles(*user_id.as_uuid()).await?;
    assert_eq!(roles.len(), 2);
    assert!(roles.contains(&role_id1));
    assert!(roles.contains(&role_id2));

    Ok(())
}

#[tokio::test]
async fn get_role_actors() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    let role_id = client.create_team_role(team_id, None).await?;
    let (user_id1, _) = client.create_user(None).await?;
    let (user_id2, _) = client.create_user(None).await?;

    // Initially the role has no actors
    let actors = client.get_role_actors(role_id).await?;
    assert!(actors.is_empty());

    // Assign the role to two users
    client
        .assign_role_to_actor(*user_id1.as_uuid(), role_id)
        .await?;
    client
        .assign_role_to_actor(*user_id2.as_uuid(), role_id)
        .await?;

    // Now the role should have both users
    let actors = client.get_role_actors(role_id).await?;
    assert_eq!(actors.len(), 2);
    assert!(actors.contains(user_id1.as_uuid()));
    assert!(actors.contains(user_id2.as_uuid()));

    Ok(())
}

#[tokio::test]
async fn get_role_actors_for_non_existent_role() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let client = db.client().await?;

    let non_existent_role_id = StandaloneTeamRoleId::new(Uuid::new_v4());
    let result = client.get_role_actors(non_existent_role_id).await;

    assert_matches!(
        result.expect_err("Getting actors for non-existent role should fail").current_context(),
        PrincipalError::TeamRoleNotFound { id } if *id == non_existent_role_id
    );

    Ok(())
}
