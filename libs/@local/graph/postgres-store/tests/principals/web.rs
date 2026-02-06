use core::{assert_matches, error::Error};

use hash_graph_authorization::policies::store::{
    CreateWebParameter, PrincipalStore as _, error::WebCreationError,
};
use hash_graph_postgres_store::permissions::PrincipalError;
use hash_graph_store::account::AccountStore as _;
use pretty_assertions::assert_eq;
use type_system::principal::{
    PrincipalId,
    actor_group::{ActorGroupId, WebId},
};
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_web() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let response = client
        .create_web(
            actor_id,
            CreateWebParameter {
                id: None,
                administrator: Some(actor_id),
                shortname: None,
                is_actor_web: false,
            },
        )
        .await?;

    assert!(client.is_web(response.web_id).await?);
    assert!(client.is_machine(response.machine_id).await?);

    let retrieved = client
        .get_web_by_id(actor_id.into(), response.web_id)
        .await?
        .expect("Web should exist");
    assert_eq!(retrieved.id, response.web_id);

    Ok(())
}

#[tokio::test]
async fn create_web_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let id = Uuid::new_v4();
    let web_id = client
        .create_web(
            actor_id,
            CreateWebParameter {
                id: Some(id),
                administrator: Some(actor_id),
                shortname: None,
                is_actor_web: false,
            },
        )
        .await?
        .web_id;
    assert_eq!(web_id, WebId::new(id));
    assert!(client.is_web(web_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_web() -> Result<(), Box<dyn Error>> {
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
    assert!(client.is_web(web_id).await?);

    client.delete_web(web_id).await?;
    assert!(!client.is_web(web_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_web_with_duplicate_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let web_id = client
        .create_web(
            actor_id,
            CreateWebParameter {
                id: Some(Uuid::new_v4()),
                administrator: Some(actor_id),
                shortname: None,
                is_actor_web: false,
            },
        )
        .await?
        .web_id;
    let result = client
        .create_web(
            actor_id,
            CreateWebParameter {
                id: Some(web_id.into()),
                administrator: Some(actor_id),
                shortname: None,
                is_actor_web: false,
            },
        )
        .await;
    drop(client);

    assert_matches!(
        result.expect_err("Creating a web with duplicate ID should fail").current_context(),
        WebCreationError::AlreadyExists { web_id: id } if *id == web_id
    );

    Ok(())
}

#[tokio::test]
async fn get_non_existent_web() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (client, actor_id) = db.seed().await?;

    let non_existent_id = WebId::new(Uuid::new_v4());
    let result = client
        .get_web_by_id(actor_id.into(), non_existent_id)
        .await?;

    assert!(
        result.is_none(),
        "Getting a non-existent web should return None"
    );

    Ok(())
}

#[tokio::test]
async fn delete_non_existent_web() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    let non_existent_id = WebId::new(Uuid::new_v4());
    let result = client.delete_web(non_existent_id).await;

    assert_matches!(
        result.expect_err("Deleting a non-existent web should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::ActorGroup(ActorGroupId::Web(non_existent_id))
    );

    Ok(())
}
