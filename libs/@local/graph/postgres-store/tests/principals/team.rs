use core::{assert_matches::assert_matches, error::Error};

use hash_graph_authorization::policies::{
    action::ActionName,
    store::{CreateWebParameter, PrincipalStore as _},
};
use hash_graph_postgres_store::permissions::PrincipalError;
use pretty_assertions::assert_eq;
use type_system::principal::{
    PrincipalId,
    actor_group::{ActorGroupId, TeamId},
};
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let team_id = client.create_team(None, ActorGroupId::Web(web_id)).await?;
    assert!(client.is_team(team_id).await?);

    let team = client.get_team(team_id).await?.expect("Team should exist");

    assert_eq!(team.parents, [ActorGroupId::Web(web_id)]);

    Ok(())
}

#[tokio::test]
async fn create_team_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let id = Uuid::new_v4();
    let team_id = client
        .create_team(Some(id), ActorGroupId::Web(web_id))
        .await?;

    assert_eq!(Uuid::from(team_id), id);
    assert!(client.is_team(team_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_team_with_hierarchy() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // Create a hierarchy: web -> mid_team -> bottom_team
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let mid_team_id = client.create_team(None, ActorGroupId::Web(web_id)).await?;
    let bottom_team_id = client
        .create_team(None, ActorGroupId::Team(mid_team_id))
        .await?;

    // Verify hierarchy is correctly established
    let team = client
        .get_team(bottom_team_id)
        .await?
        .expect("Team should exist");

    assert_eq!(
        team.parents,
        [ActorGroupId::Team(mid_team_id), ActorGroupId::Web(web_id)]
    );

    // Delete hierarchy in correct order - bottom-up
    // Delete bottom team first
    client.delete_team(bottom_team_id).await?;

    // Verify bottom team no longer exists
    assert!(
        !client.is_team(bottom_team_id).await?,
        "Bottom team should be deleted"
    );

    // Verify mid_team still exists
    assert!(
        client.is_team(mid_team_id).await?,
        "Mid team should still exist"
    );

    // Now we can delete mid_team since it no longer has children
    client.delete_team(mid_team_id).await?;

    // Verify mid_team no longer exists
    assert!(
        !client.is_team(mid_team_id).await?,
        "Mid team should be deleted"
    );

    Ok(())
}

#[tokio::test]
async fn delete_non_existent_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed([]).await?;

    // Try to delete a non-existent team
    let non_existent_id = TeamId::new(Uuid::new_v4());
    let result = client.delete_team(non_existent_id).await;

    // Verify it returns the correct error
    assert_matches!(
        result.expect_err("Deleting a non-existent team should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::ActorGroup(ActorGroupId::Team(non_existent_id)),
        "Error should indicate that team was not found"
    );

    Ok(())
}

#[tokio::test]
async fn can_delete_team_with_children() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // Create a simple parent-child hierarchy
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let parent_team_id = client.create_team(None, ActorGroupId::Web(web_id)).await?;
    let child_team_id = client
        .create_team(None, ActorGroupId::Team(parent_team_id))
        .await?;

    // Delete the parent team
    client.delete_team(parent_team_id).await?;

    // Verify both teams no longer exist
    assert!(!client.is_team(parent_team_id).await?);
    assert!(!client.is_team(child_team_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_team_with_duplicate_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // Create a parent team
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;

    // Create a team with a specific ID
    let id = Uuid::new_v4();
    let team_id = client
        .create_team(Some(id), ActorGroupId::Web(web_id))
        .await?;

    // Try to create another team with the same ID
    let result = client
        .create_team(Some(id), ActorGroupId::Web(web_id))
        .await;

    // The implementation now returns a PrincipalAlreadyExists error
    assert_matches!(
        result.expect_err("Creating a team with duplicate ID should fail").current_context(),
        PrincipalError::PrincipalAlreadyExists { id: error_id } if *error_id == PrincipalId::ActorGroup(ActorGroupId::Team(team_id)),
        "Error should indicate that team already exists"
    );

    // The duplicate ID should still exist
    assert!(
        client.is_team(team_id).await?,
        "Original team should still exist"
    );

    Ok(())
}

#[tokio::test]
async fn get_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    // Create a parent team and team
    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let team_id = client.create_team(None, ActorGroupId::Web(web_id)).await?;

    // Get the team and verify it matches
    let retrieved = client.get_team(team_id).await?.expect("Team should exist");
    assert_eq!(retrieved.id, team_id);

    Ok(())
}

#[tokio::test]
async fn get_non_existent_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (client, _actor_id) = db.seed([]).await?;

    // Try to get a non-existent team
    let non_existent_id = TeamId::new(Uuid::new_v4());
    let result = client.get_team(non_existent_id).await?;

    // The implementation now returns a PrincipalNotFound error
    assert!(
        result.is_none(),
        "Getting a non-existent team should return None"
    );

    Ok(())
}
