use core::{assert_matches::assert_matches, error::Error};

use hash_graph_authorization::policies::principal::{
    PrincipalId,
    team::{SubteamId, TeamId},
};
use hash_graph_postgres_store::permissions::PrincipalError;
use pretty_assertions::assert_eq;
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_subteam() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let web_id = client.create_web(None).await?;
    let subteam_id = client.create_subteam(None, TeamId::Web(web_id)).await?;
    assert!(client.is_subteam(subteam_id).await?);

    let subteam = client
        .get_subteam(SubteamId::new(*subteam_id.as_uuid()))
        .await?
        .expect("Subteam should exist");

    assert_eq!(subteam.parents, [TeamId::Web(web_id)]);

    Ok(())
}

#[tokio::test]
async fn create_subteam_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let web_id = client.create_web(None).await?;
    let id = Uuid::new_v4();
    let subteam_id = client.create_subteam(Some(id), TeamId::Web(web_id)).await?;

    assert_eq!(*subteam_id.as_uuid(), id);
    assert!(client.is_subteam(subteam_id).await?);

    Ok(())
}

#[tokio::test]
async fn test_recursive_team_hierarchy() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a top-level team
    let web_id = client.create_web(None).await?;

    // Create first-level subteam
    let mid_subteam_id = client.create_subteam(None, TeamId::Web(web_id)).await?;

    // Create second-level subteam
    let bottom_subteam_id = client
        .create_subteam(None, TeamId::Subteam(mid_subteam_id))
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
        [TeamId::Subteam(mid_subteam_id), TeamId::Web(web_id)]
    );

    Ok(())
}

#[tokio::test]
async fn test_delete_subteam_with_hierarchy() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a hierarchy: web -> mid_team -> bottom_team
    let web_id = client.create_web(None).await?;
    let mid_subteam_id = client.create_subteam(None, TeamId::Web(web_id)).await?;
    let bottom_subteam_id = client
        .create_subteam(None, TeamId::Subteam(mid_subteam_id))
        .await?;

    // Verify hierarchy is correctly established
    let subteam = client
        .get_subteam(SubteamId::new(*bottom_subteam_id.as_uuid()))
        .await?
        .expect("Subteam should exist");

    assert_eq!(
        subteam.parents,
        [TeamId::Subteam(mid_subteam_id), TeamId::Web(web_id)]
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
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Team(TeamId::Subteam(non_existent_id)),
        "Error should indicate that subteam was not found"
    );

    Ok(())
}

#[tokio::test]
async fn test_can_delete_subteam_with_children() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a simple parent-child hierarchy
    let web_id = client.create_web(None).await?;
    let parent_subteam_id = client.create_subteam(None, TeamId::Web(web_id)).await?;
    let child_subteam_id = client
        .create_subteam(None, TeamId::Subteam(parent_subteam_id))
        .await?;

    // Delete the parent team
    client.delete_subteam(parent_subteam_id).await?;

    // Verify both subteams no longer exist
    assert!(!client.is_subteam(parent_subteam_id).await?);
    assert!(!client.is_subteam(child_subteam_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_subteam_with_duplicate_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    // Create a parent team
    let web_id = client.create_web(None).await?;

    // Create a subteam with a specific ID
    let id = Uuid::new_v4();
    let subteam_id = client.create_subteam(Some(id), TeamId::Web(web_id)).await?;

    // Try to create another subteam with the same ID
    let result = client.create_subteam(Some(id), TeamId::Web(web_id)).await;

    // The implementation now returns a PrincipalAlreadyExists error
    assert_matches!(
        result.expect_err("Creating a subteam with duplicate ID should fail").current_context(),
        PrincipalError::PrincipalAlreadyExists { id: error_id } if *error_id == PrincipalId::Team(TeamId::Subteam(subteam_id)),
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
    let web_id = client.create_web(None).await?;
    let subteam_id = client.create_subteam(None, TeamId::Web(web_id)).await?;

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
