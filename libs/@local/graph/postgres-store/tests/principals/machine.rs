use core::{assert_matches::assert_matches, error::Error};

use hash_graph_authorization::policies::{
    action::ActionName,
    store::{CreateWebParameter, PrincipalStore as _},
};
use hash_graph_postgres_store::permissions::PrincipalError;
use pretty_assertions::assert_eq;
use type_system::principal::{
    PrincipalId,
    actor::{ActorId, MachineId},
};
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed([]).await?;

    let machine_id = client.create_machine(None).await?;
    assert!(client.is_machine(machine_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_machine_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed([]).await?;

    let id = Uuid::new_v4();
    let machine_id = client.create_machine(Some(id)).await?;
    assert_eq!(Uuid::from(machine_id), id);
    assert!(client.is_machine(machine_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed([]).await?;

    let machine_id = client.create_machine(None).await?;
    assert!(client.is_machine(machine_id).await?);

    client.delete_machine(machine_id).await?;
    assert!(!client.is_machine(machine_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_machine_with_duplicate_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed([]).await?;

    let machine_id = client.create_machine(Some(Uuid::new_v4())).await?;
    let result = client.create_machine(Some(machine_id.into())).await;
    drop(client);

    assert_matches!(
        result.expect_err("Creating a machine with duplicate ID should fail").current_context(),
        PrincipalError::PrincipalAlreadyExists { id } if *id == PrincipalId::Actor(ActorId::Machine(machine_id))
    );

    Ok(())
}

#[tokio::test]
async fn delete_non_existent_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed([]).await?;

    let non_existent_id = MachineId::new(Uuid::new_v4());
    let result = client.delete_machine(non_existent_id).await;
    drop(client);

    assert_matches!(
        result.expect_err("Deleting a non-existent machine should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Actor(ActorId::Machine(non_existent_id))
    );

    Ok(())
}

#[tokio::test]
async fn create_web_machine_relation() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed([ActionName::All, ActionName::CreateWeb]).await?;

    let web_id = client
        .create_web(actor_id, CreateWebParameter { id: None })
        .await?;
    let machine_id = client.create_machine(None).await?;

    assert!(client.is_web(web_id).await?);
    assert!(client.is_machine(machine_id).await?);

    Ok(())
}

#[tokio::test]
async fn get_non_existent_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (client, _actor_id) = db.seed([]).await?;

    let non_existent_id = MachineId::new(Uuid::new_v4());
    let result = client.get_machine(non_existent_id).await?;

    assert!(
        result.is_none(),
        "Getting a non-existent machine should return None"
    );

    Ok(())
}

#[tokio::test]
async fn get_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed([]).await?;

    let machine_id = client.create_machine(None).await?;
    let retrieved = client
        .get_machine(machine_id)
        .await?
        .expect("Machine should exist");

    assert_eq!(
        retrieved.id, machine_id,
        "Retrieved machine ID should match the created machine ID"
    );

    Ok(())
}
