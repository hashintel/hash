use core::{assert_matches, error::Error};

use hash_graph_authorization::policies::store::{CreateWebParameter, PrincipalStore as _};
use hash_graph_postgres_store::permissions::PrincipalError;
use hash_graph_store::account::AccountStore as _;
use pretty_assertions::assert_eq;
use type_system::principal::{
    PrincipalId,
    actor::{ActorId, MachineId},
    role::RoleName,
};
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    let machine_id = client.create_machine(None, "test-machine").await?;
    assert!(client.is_machine(machine_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_machine_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    let id = Uuid::new_v4();
    let machine_id = client.create_machine(Some(id), "test-machine").await?;
    assert_eq!(Uuid::from(machine_id), id);
    assert!(client.is_machine(machine_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    let machine_id = client.create_machine(None, "test-machine").await?;
    assert!(client.is_machine(machine_id).await?);

    client.delete_machine(machine_id).await?;
    assert!(!client.is_machine(machine_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_machine_with_duplicate_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    let machine_id = client
        .create_machine(Some(Uuid::new_v4()), "test-machine")
        .await?;
    let result = client
        .create_machine(Some(machine_id.into()), "test-machine-duplicate")
        .await;
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
    let (mut client, _actor_id) = db.seed().await?;

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
    let (mut client, actor_id) = db.seed().await?;

    let web_id = client
        .create_web(
            actor_id,
            CreateWebParameter {
                id: None,
                administrator: Some(actor_id),
                shortname: None,
                is_actor_web: false,
            },
        )
        .await?
        .web_id;
    let machine_id = client.create_machine(None, "test-machine").await?;

    assert!(client.is_web(web_id).await?);
    assert!(client.is_machine(machine_id).await?);

    Ok(())
}

#[tokio::test]
async fn get_non_existent_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (client, actor_id) = db.seed().await?;

    let non_existent_id = MachineId::new(Uuid::new_v4());
    let result = client
        .get_machine_by_id(actor_id.into(), non_existent_id)
        .await?;

    assert!(
        result.is_none(),
        "Getting a non-existent machine should return None"
    );

    Ok(())
}

#[tokio::test]
async fn get_machine() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let machine_id = client.create_machine(None, "test-machine").await?;
    let retrieved = client
        .get_machine_by_identifier(actor_id.into(), "test-machine")
        .await?
        .expect("Machine should exist");

    assert_eq!(
        retrieved.id, machine_id,
        "Retrieved machine ID should match the created machine ID"
    );

    Ok(())
}

#[tokio::test]
async fn machine_role_assignment() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let machine_id = client.create_machine(None, "test-machine").await?;
    let web_id = client
        .create_web(
            actor_id,
            CreateWebParameter {
                id: None,
                administrator: Some(actor_id),
                shortname: None,
                is_actor_web: false,
            },
        )
        .await?
        .web_id;

    // Assign the role to the machine
    client
        .assign_role(
            actor_id.into(),
            machine_id.into(),
            web_id.into(),
            RoleName::Administrator,
        )
        .await?;

    // Check that the machine has the role assigned
    let machine_roles = client.get_actor_roles(machine_id.into()).await?;
    let (role_id, role) = machine_roles
        .iter()
        .find(|(_, role)| role.name() == RoleName::Administrator)
        .expect("Machine should have the Administrator role");

    assert_eq!(role.actor_group_id(), web_id.into());

    // Check that the role has the machine assigned
    let role_actors = client.get_role_actors(*role_id).await?;
    assert!(role_actors.contains(&machine_id.into()));

    // Unassign the role from the machine
    client.unassign_role_by_id(machine_id, *role_id).await?;

    // Check that the machine no longer has the role assigned
    let machine_roles_after = client.get_actor_roles(machine_id.into()).await?;
    assert!(!machine_roles_after.contains_key(role_id));

    Ok(())
}
