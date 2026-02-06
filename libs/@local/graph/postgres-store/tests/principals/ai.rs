use core::{assert_matches, error::Error};

use hash_graph_authorization::policies::store::{CreateWebParameter, PrincipalStore as _};
use hash_graph_postgres_store::permissions::PrincipalError;
use hash_graph_store::account::AccountStore as _;
use pretty_assertions::assert_eq;
use type_system::principal::{
    PrincipalId,
    actor::{ActorId, AiId},
    role::RoleName,
};
use uuid::Uuid;

use crate::DatabaseTestWrapper;

#[tokio::test]
async fn create_ai() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    let ai_id = client.create_ai(None, "test-ai").await?;
    assert!(client.is_ai(ai_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_ai_with_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    let id = Uuid::new_v4();
    let ai_id = client.create_ai(Some(id), "test-ai").await?;
    assert_eq!(ai_id, AiId::new(id));

    assert!(client.is_ai(ai_id).await?);

    Ok(())
}

#[tokio::test]
async fn delete_ai() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    let ai_id = client.create_ai(None, "test-ai").await?;
    assert!(client.is_ai(ai_id).await?);

    client.delete_ai(ai_id).await?;
    assert!(!client.is_ai(ai_id).await?);

    Ok(())
}

#[tokio::test]
async fn create_ai_with_duplicate_id() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    let ai_id = client.create_ai(Some(Uuid::new_v4()), "test-ai").await?;
    let result = client.create_ai(Some(ai_id.into()), "test-ai2").await;
    drop(client);

    let expected_actor_id = ActorId::Ai(ai_id);

    assert_matches!(
        result.expect_err("Creating an AI with duplicate ID should fail").current_context(),
        PrincipalError::PrincipalAlreadyExists { id } if *id == PrincipalId::Actor(expected_actor_id)
    );

    Ok(())
}

#[tokio::test]
async fn get_non_existent_ai() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (client, actor_id) = db.seed().await?;

    let non_existent_id = AiId::new(Uuid::new_v4());
    let result = client
        .get_ai_by_id(actor_id.into(), non_existent_id)
        .await?;

    assert!(
        result.is_none(),
        "Getting a non-existent AI should return None"
    );

    Ok(())
}

#[tokio::test]
async fn delete_non_existent_ai() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, _actor_id) = db.seed().await?;

    let non_existent_id = AiId::new(Uuid::new_v4());
    let result = client.delete_ai(non_existent_id).await;

    let expected_actor_id = ActorId::Ai(non_existent_id);

    assert_matches!(
        result.expect_err("Deleting a non-existent AI should fail").current_context(),
        PrincipalError::PrincipalNotFound { id } if *id == PrincipalId::Actor(expected_actor_id)
    );

    Ok(())
}

#[tokio::test]
async fn create_web_ai_relation() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let ai_id = client.create_ai(None, "test-ai").await?;
    let web_id = client
        .create_web(
            actor_id,
            CreateWebParameter {
                id: None,
                administrator: Some(ai_id.into()),
                is_actor_web: true,
                shortname: None,
            },
        )
        .await?
        .web_id;

    assert!(client.is_web(web_id).await?);
    assert!(client.is_ai(ai_id).await?);

    Ok(())
}

#[tokio::test]
async fn ai_role_assignment() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let (mut client, actor_id) = db.seed().await?;

    let ai_id = client.create_ai(None, "test-ai").await?;
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

    // Assign the role to the AI
    client
        .assign_role(
            actor_id.into(),
            ai_id.into(),
            web_id.into(),
            RoleName::Administrator,
        )
        .await?;

    // Check that the AI has the role assigned
    let ai_roles = client.get_actor_roles(ai_id.into()).await?;
    let (role_id, role) = ai_roles
        .iter()
        .find(|(_, role)| role.name() == RoleName::Administrator)
        .expect("AI should have the Administrator role");

    assert_eq!(role.actor_group_id(), web_id.into());

    // Check that the role has the AI assigned
    let role_actors = client.get_role_actors(*role_id).await?;
    assert!(role_actors.contains(&ai_id.into()));

    // Unassign the role from the AI
    client.unassign_role_by_id(ai_id, *role_id).await?;

    // Check that the AI no longer has the role assigned
    let ai_roles_after = client.get_actor_roles(ai_id.into()).await?;
    assert!(!ai_roles_after.contains_key(role_id));

    Ok(())
}
