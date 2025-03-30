use core::{assert_matches::assert_matches, error::Error};

use hash_graph_authorization::policies::principal::{
    PrincipalId,
    team::{StandaloneTeamId, SubteamId, TeamId},
};
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

    let retrieved = client
        .get_standalone_team(team_id)
        .await?
        .expect("Team should exist");
    assert_eq!(retrieved.id, team_id);

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
        PrincipalError::PrincipalAlreadyExists { id } if *id == PrincipalId::Team(TeamId::Standalone(team_id)),
        "Error should indicate that team already exists"
    );

    Ok(())
}

#[tokio::test]
async fn get_non_existent_standalone_team() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let client = db.client().await?;

    let non_existent_team_id = StandaloneTeamId::new(Uuid::new_v4());
    let result = client.get_standalone_team(non_existent_team_id).await?;

    assert!(
        result.is_none(),
        "Getting a non-existent team should return None"
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
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Team(TeamId::Standalone(non_existent_id)),
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

    let subteam = client
        .get_subteam(SubteamId::new(*subteam_id.as_uuid()))
        .await?
        .expect("Subteam should exist");

    assert_eq!(subteam.parents, [TeamId::Standalone(parent_team_id)]);

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
async fn test_recursive_team_hierarchy() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a top-level team
    let top_team_id = client.create_standalone_team(None).await?;

    // Create first-level subteam
    let mid_subteam_id = client
        .create_subteam(None, TeamId::Standalone(top_team_id))
        .await?;

    // Create second-level subteam
    let bottom_subteam_id = client
        .create_subteam(None, TeamId::Sub(mid_subteam_id))
        .await?;

    // Check that the second-level subteam has both the first-level subteam and the top team as
    // parents
    let subteam = client
        .get_subteam(SubteamId::new(*bottom_subteam_id.as_uuid()))
        .await?
        .expect("Subteam should exist");

    // We expect 2 parents with proper depths:
    // - mid_subteam with depth 1 (direct parent)
    // - top_team with depth 2 (grandparent)
    assert_eq!(
        subteam.parents,
        [TeamId::Sub(mid_subteam_id), TeamId::Standalone(top_team_id)]
    );

    Ok(())
}

#[tokio::test]
async fn test_delete_subteam_with_hierarchy() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a hierarchy: top_team -> mid_team -> bottom_team
    let top_team_id = client.create_standalone_team(None).await?;
    let mid_subteam_id = client
        .create_subteam(None, TeamId::Standalone(top_team_id))
        .await?;
    let bottom_subteam_id = client
        .create_subteam(None, TeamId::Sub(mid_subteam_id))
        .await?;

    // Verify hierarchy is correctly established
    let subteam = client
        .get_subteam(SubteamId::new(*bottom_subteam_id.as_uuid()))
        .await?
        .expect("Subteam should exist");

    assert_eq!(
        subteam.parents,
        [TeamId::Sub(mid_subteam_id), TeamId::Standalone(top_team_id)]
    );

    // Delete hierarchy in correct order - bottom-up
    // Delete bottom subteam first
    client.delete_subteam(bottom_subteam_id).await?;

    // Verify bottom subteam no longer exists
    assert!(
        !client.is_subteam(bottom_subteam_id).await?,
        "Bottom subteam should be deleted"
    );

    // Verify mid_subteam still exists
    assert!(
        client.is_subteam(mid_subteam_id).await?,
        "Mid subteam should still exist"
    );

    // Now we can delete mid_subteam since it no longer has children
    client.delete_subteam(mid_subteam_id).await?;

    // Verify mid_subteam no longer exists
    assert!(
        !client.is_subteam(mid_subteam_id).await?,
        "Mid subteam should be deleted"
    );

    Ok(())
}

#[tokio::test]
async fn test_delete_non_existent_subteam() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Try to delete a non-existent subteam
    let non_existent_id = SubteamId::new(Uuid::new_v4());
    let result = client.delete_subteam(non_existent_id).await;

    // Verify it returns the correct error
    assert_matches!(
        result.expect_err("Deleting a non-existent subteam should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Team(TeamId::Sub(non_existent_id)),
        "Error should indicate that subteam was not found"
    );

    Ok(())
}

#[tokio::test]
async fn test_cannot_delete_subteam_with_children() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a simple parent-child hierarchy
    let parent_team_id = client.create_standalone_team(None).await?;
    let parent_subteam_id = client
        .create_subteam(None, TeamId::Standalone(parent_team_id))
        .await?;
    let _child_subteam_id = client
        .create_subteam(None, TeamId::Sub(parent_subteam_id))
        .await?;

    // Try to delete parent subteam - should fail because it has children
    let delete_result = client.delete_subteam(parent_subteam_id).await;

    // Verify error is what we expect
    assert_matches!(
        delete_result.expect_err("Deleting a subteam with children should fail").current_context(),
        PrincipalError::TeamHasChildren { id } if *id == TeamId::Sub(parent_subteam_id),
        "Error should indicate that subteam has children"
    );

    // Don't try to check anything else after the error, as the transaction is aborted
    // The test would rollback automatically when it ends

    Ok(())
}

#[tokio::test]
async fn create_subteam_with_duplicate_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a parent team
    let parent_team_id = client.create_standalone_team(None).await?;

    // Create a subteam with a specific ID
    let id = Uuid::new_v4();
    let subteam_id = client
        .create_subteam(Some(id), TeamId::Standalone(parent_team_id))
        .await?;

    // Try to create another subteam with the same ID
    let result = client
        .create_subteam(Some(id), TeamId::Standalone(parent_team_id))
        .await;

    // The implementation now returns a PrincipalAlreadyExists error
    assert_matches!(
        result.expect_err("Creating a subteam with duplicate ID should fail").current_context(),
        PrincipalError::PrincipalAlreadyExists { id: error_id } if *error_id == PrincipalId::Team(TeamId::Sub(subteam_id)),
        "Error should indicate that subteam already exists"
    );

    // The duplicate ID should still exist
    assert!(
        client.is_subteam(subteam_id).await?,
        "Original subteam should still exist"
    );

    Ok(())
}

#[tokio::test]
async fn get_subteam() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a parent team and subteam
    let parent_team_id = client.create_standalone_team(None).await?;
    let subteam_id = client
        .create_subteam(None, TeamId::Standalone(parent_team_id))
        .await?;

    // Get the subteam and verify it matches
    let retrieved = client
        .get_subteam(subteam_id)
        .await?
        .expect("Subteam should exist");
    assert_eq!(retrieved.id, subteam_id);

    Ok(())
}

#[tokio::test]
async fn get_non_existent_subteam() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let client = db.client().await?;

    // Try to get a non-existent subteam
    let non_existent_id = SubteamId::new(Uuid::new_v4());
    let result = client.get_subteam(non_existent_id).await?;

    // The implementation now returns a PrincipalNotFound error
    assert!(
        result.is_none(),
        "Getting a non-existent subteam should return None"
    );

    Ok(())
}
