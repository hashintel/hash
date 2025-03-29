use core::{assert_matches::assert_matches, error::Error};

use hash_graph_authorization::policies::principal::team::{StandaloneTeamId, SubteamId, TeamId};
use hash_graph_postgres_store::permissions::PrincipalError;
use pretty_assertions::assert_eq;
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_standalone_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    assert!(client.is_standalone_team(team_id).await?);

    let retrieved_team_id = client.get_standalone_team(team_id).await?;
    assert_eq!(retrieved_team_id, team_id);

    Ok(())
}

#[tokio::test]
async fn create_standalone_team_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let id = Uuid::new_v4();
    let team_id = client.create_standalone_team(Some(id)).await?;
    assert_eq!(*team_id.as_uuid(), id);
    assert!(client.is_standalone_team(team_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_standalone_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    assert!(client.is_standalone_team(team_id).await?);

    client.delete_standalone_team(team_id).await?;
    assert!(!client.is_standalone_team(team_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_standalone_team_with_duplicate_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let team_id = client.create_standalone_team(None).await?;
    let result = client
        .create_standalone_team(Some(*team_id.as_uuid()))
        .await;

    assert_matches!(
        result.expect_err("Creating a team with duplicate ID should fail").current_context(),
        PrincipalError::PrincipalAlreadyExists { id } if id == team_id.as_uuid(),
        "Error should indicate that team already exists"
    );

    Ok(())
}

#[tokio::test]
async fn get_non_existent_standalone_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let client = db.client().await?;

    let non_existent_team_id = StandaloneTeamId::new(Uuid::new_v4());
    let result = client.get_standalone_team(non_existent_team_id).await;

    assert_matches!(
        result.expect_err("Getting a non-existent team should fail").current_context(),
        PrincipalError::StandaloneTeamNotFound { id } if *id == non_existent_team_id,
        "Error should indicate that standalone team was not found"
    );

    Ok(())
}

/// Tests that deleting a non-existent standalone team returns an error.
#[tokio::test]
async fn delete_non_existent_standalone_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let non_existent_id = StandaloneTeamId::new(Uuid::new_v4());
    let result = client.delete_standalone_team(non_existent_id).await;

    assert_matches!(
        result.expect_err("Deleting a non-existent team should fail").current_context(),
        PrincipalError::StandaloneTeamNotFound { id } if *id == non_existent_id,
        "Error should indicate that team was not found"
    );

    Ok(())
}

#[tokio::test]
async fn create_subteam() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let parent_team_id = client.create_standalone_team(None).await?;
    let subteam_id = client
        .create_subteam(None, TeamId::Standalone(parent_team_id))
        .await?;
    assert!(client.is_subteam(subteam_id).await?);

    let parents = client
        .get_subteam_parents(SubteamId::new(*subteam_id.as_uuid()))
        .await?;

    assert_eq!(parents.len(), 1);
    assert_matches!(parents[0], TeamId::Standalone(id) if id == parent_team_id);

    let children = client
        .get_team_children(TeamId::Standalone(parent_team_id))
        .await?;

    assert_eq!(children.len(), 1);
    assert_eq!(children[0].as_uuid(), subteam_id.as_uuid());

    Ok(())
}

#[tokio::test]
async fn create_subteam_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let parent_team_id = client.create_standalone_team(None).await?;
    let id = Uuid::new_v4();
    let subteam_id = client
        .create_subteam(Some(id), TeamId::Standalone(parent_team_id))
        .await?;

    assert_eq!(*subteam_id.as_uuid(), id);
    assert!(client.is_subteam(subteam_id).await?);

    Ok(())
}

#[tokio::test]
async fn test_team_hierarchy() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let parent_team_id = client.create_standalone_team(None).await?;
    let subteam_id1 = client
        .create_subteam(None, TeamId::Standalone(parent_team_id))
        .await?;
    let subteam_id2 = client
        .create_subteam(None, TeamId::Standalone(parent_team_id))
        .await?;

    let children = client
        .get_team_children(TeamId::Standalone(parent_team_id))
        .await?;

    assert_eq!(children.len(), 2);
    assert!(
        children
            .iter()
            .any(|id| id.as_uuid() == subteam_id1.as_uuid())
    );
    assert!(
        children
            .iter()
            .any(|id| id.as_uuid() == subteam_id2.as_uuid())
    );

    // Test adding another parent to subteam1
    let another_parent_id = client.create_standalone_team(None).await?;
    let subteam_id1_as_sub = SubteamId::new(*subteam_id1.as_uuid());

    client
        .add_subteam_parent(subteam_id1_as_sub, TeamId::Standalone(another_parent_id))
        .await?;

    // Now subteam1 should have two parents
    let parents = client.get_subteam_parents(subteam_id1_as_sub).await?;
    assert_eq!(parents.len(), 2);
    assert!(
        parents
            .iter()
            .any(|id| matches!(id, TeamId::Standalone(id) if *id == parent_team_id))
    );
    assert!(
        parents
            .iter()
            .any(|id| matches!(id, TeamId::Standalone(id) if *id == another_parent_id))
    );

    // Test removing a parent
    client
        .remove_subteam_parent(subteam_id1_as_sub, TeamId::Standalone(another_parent_id))
        .await?;

    // Now subteam1 should have only one parent again
    let parents = client.get_subteam_parents(subteam_id1_as_sub).await?;

    assert_eq!(parents.len(), 1);
    assert_matches!(parents[0], TeamId::Standalone(id) if id == parent_team_id);

    Ok(())
}

#[tokio::test]
async fn delete_subteam() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let parent_team_id = client.create_standalone_team(None).await?;
    let subteam_id = client
        .create_subteam(None, TeamId::Standalone(parent_team_id))
        .await?;
    assert!(client.is_subteam(subteam_id).await?);

    client.delete_subteam(subteam_id).await?;
    assert!(!client.is_subteam(subteam_id).await?);

    assert!(client.is_standalone_team(parent_team_id).await?);

    let children = client
        .get_team_children(TeamId::Standalone(parent_team_id))
        .await?;

    assert!(children.is_empty());

    Ok(())
}
