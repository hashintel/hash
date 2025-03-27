use core::{assert_matches::assert_matches, error::Error};

use hash_graph_authorization::policies::principal::user::UserId;
use hash_graph_postgres_store::permissions::PrincipalError;
use pretty_assertions::assert_eq;
use type_system::web::OwnedById;
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_user() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut transaction = db.transaction().await?;

    let (user_id, web_id) = transaction.create_user(None).await?;
    assert!(transaction.is_user(user_id).await?);
    assert!(transaction.is_web(web_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_user_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut transaction = db.transaction().await?;

    let id = Uuid::new_v4();
    let (user_id, web_id) = transaction.create_user(Some(id)).await?;
    assert_eq!(user_id, UserId::new(id));
    assert_eq!(web_id, OwnedById::new(id));

    assert!(transaction.is_user(user_id).await?);
    assert!(transaction.is_web(web_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_user() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut transaction = db.transaction().await?;

    let (user_id, web_id) = transaction.create_user(None).await?;
    assert!(transaction.is_user(user_id).await?);
    assert!(transaction.is_web(web_id).await?);

    transaction.delete_user(user_id).await?;
    assert!(!transaction.is_user(user_id).await?);
    assert!(!transaction.is_web(web_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_user_with_duplicate_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut transaction = db.transaction().await?;

    let (user_id, _) = transaction.create_user(Some(Uuid::new_v4())).await?;
    let result = transaction.create_user(Some(*user_id.as_uuid())).await;
    drop(transaction);

    assert_matches!(
        result.expect_err("Creating a user with duplicate ID should fail").current_context(),
        PrincipalError::PrincipalAlreadyExists { id } if id == user_id.as_uuid()
    );

    Ok(())
}

#[tokio::test]
async fn get_non_existent_user() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let transaction = db.transaction().await?;

    let non_existent_id = UserId::new(Uuid::new_v4());
    let result = transaction.get_user(non_existent_id).await;
    drop(transaction);

    assert_matches!(
        result.expect_err("Getting a non-existent user should fail").current_context(),
        PrincipalError::UserNotFound { id } if *id == non_existent_id
    );

    Ok(())
}

#[tokio::test]
async fn delete_non_existent_user() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut transaction = db.transaction().await?;

    let non_existent_id = UserId::new(Uuid::new_v4());
    let result = transaction.delete_user(non_existent_id).await;

    assert_matches!(
        result.expect_err("Deleting a non-existent user should fail").current_context(),
        PrincipalError::UserNotFound { id } if *id == non_existent_id
    );

    Ok(())
}
