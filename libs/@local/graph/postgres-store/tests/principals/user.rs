use core::{assert_matches::assert_matches, error::Error};

use hash_graph_authorization::policies::principal::PrincipalId;
use hash_graph_postgres_store::permissions::PrincipalError;
use pretty_assertions::assert_eq;
use type_system::{
    knowledge::entity::id::EntityUuid,
    provenance::{ActorEntityUuid, ActorId, UserId},
};
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_user() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let user_id = client.create_user(None).await?;
    assert!(client.is_user(user_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_user_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let id = Uuid::new_v4();
    let user_id = client.create_user(Some(id)).await?;
    assert_eq!(
        user_id,
        UserId::new(ActorEntityUuid::new(EntityUuid::new(id)))
    );

    assert!(client.is_user(user_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_user() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let user_id = client.create_user(None).await?;
    assert!(client.is_user(user_id).await?);

    client.delete_user(user_id).await?;
    assert!(!client.is_user(user_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_user_with_duplicate_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let user_id = client.create_user(Some(Uuid::new_v4())).await?;
    let result = client.create_user(Some(*user_id.as_uuid())).await;
    drop(client);

    assert_matches!(
        result.expect_err("Creating a user with duplicate ID should fail").current_context(),
        PrincipalError::PrincipalAlreadyExists { id } if *id == PrincipalId::Actor(ActorId::User(user_id))
    );

    Ok(())
}

#[tokio::test]
async fn get_non_existent_user() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let client = db.client().await?;

    let non_existent_id = UserId::new(ActorEntityUuid::new(EntityUuid::new(Uuid::new_v4())));
    let result = client.get_user(non_existent_id).await?;

    assert!(
        result.is_none(),
        "Getting a non-existent user should return None"
    );

    Ok(())
}

#[tokio::test]
async fn delete_non_existent_user() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut client = db.client().await?;

    let non_existent_id = UserId::new(ActorEntityUuid::new(EntityUuid::new(Uuid::new_v4())));
    let result = client.delete_user(non_existent_id).await;

    assert_matches!(
        result.expect_err("Deleting a non-existent user should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Actor(ActorId::User(non_existent_id))
    );

    Ok(())
}
