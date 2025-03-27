use core::{assert_matches::assert_matches, error::Error};

use hash_graph_authorization::policies::principal::machine::MachineId;
use hash_graph_postgres_store::permissions::PrincipalError;
use pretty_assertions::assert_eq;
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut transaction = db.transaction().await?;

    let machine_id = transaction.create_machine(None).await?;
    assert!(transaction.is_machine(machine_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_machine_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut transaction = db.transaction().await?;

    let id = Uuid::new_v4();
    let machine_id = transaction.create_machine(Some(id)).await?;
    assert_eq!(*machine_id.as_uuid(), id);
    assert!(transaction.is_machine(machine_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut transaction = db.transaction().await?;

    let machine_id = transaction.create_machine(None).await?;
    assert!(transaction.is_machine(machine_id).await?);

    transaction.delete_machine(machine_id).await?;
    assert!(!transaction.is_machine(machine_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_machine_with_duplicate_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut transaction = db.transaction().await?;

    let machine_id = transaction.create_machine(Some(Uuid::new_v4())).await?;
    let result = transaction
        .create_machine(Some(*machine_id.as_uuid()))
        .await;
    drop(transaction);

    assert_matches!(
        result.expect_err("Creating a machine with duplicate ID should fail").current_context(),
        PrincipalError::PrincipalAlreadyExists { id } if id == machine_id.as_uuid()
    );

    Ok(())
}

#[tokio::test]
async fn delete_non_existent_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut transaction = db.transaction().await?;

    let non_existent_id = MachineId::new(Uuid::new_v4());
    let result = transaction.delete_machine(non_existent_id).await;
    drop(transaction);

    assert_matches!(
        result.expect_err("Deleting a non-existent machine should fail").current_context(),
        PrincipalError::MachineNotFound { id } if *id == non_existent_id
    );

    Ok(())
}

#[tokio::test]
async fn create_web_machine_relation() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut transaction = db.transaction().await?;

    let web_id = transaction.create_web(None).await?;
    let machine_id = transaction.create_machine(None).await?;

    assert!(transaction.is_web(web_id).await?);
    assert!(transaction.is_machine(machine_id).await?);

    Ok(())
}
