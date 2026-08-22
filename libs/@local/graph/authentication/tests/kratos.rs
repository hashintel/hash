#![expect(
    clippy::panic_in_result_fn,
    reason = "tests assert on results and panic on failure"
)]

//! Contract tests for the Kratos identity lookup behind Cloudflare Access authentication.
//!
//! The unit tests of [`KratosEmailActorResolver`] serve its responses from a hand-written fake, so
//! they hold only as long as that fake matches Kratos. These tests run the resolver against the
//! live Kratos of the compose stack, which is what makes the wire format and the lookup semantics
//! an observation rather than an assumption.
//!
//! `HASH_KRATOS_ADMIN_URL` points at that Kratos.
//!
//! Each test creates identities under a unique address and deletes them before returning. An
//! assertion failure aborts the test before its cleanup, leaving the identity behind — acceptable
//! because the addresses are unique per run and CI discards the container.

use core::{error::Error, time::Duration};

use hash_graph_authentication::{
    actor::ResolveActor,
    cloudflare::ResolveEmailActor as _,
    kratos::{KratosAdminConfig, KratosEmailActorResolver},
    request::AuthenticationError,
};
use hash_graph_authorization::policies::store::error::DetermineActorError;
use reqwest::{Client, Url};
use serde_json::json;
use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
use uuid::Uuid;

/// Resolves every actor to the user it names, so a test can assert which UUID the resolver read
/// out of the identity's metadata.
struct EchoingActorResolver;

impl ResolveActor for EchoingActorResolver {
    fn resolve_actor(
        &self,
        actor_entity_uuid: ActorEntityUuid,
    ) -> impl Future<Output = Result<Option<ActorId>, error_stack::Report<DetermineActorError>>> + Send
    {
        core::future::ready(Ok(Some(ActorId::User(UserId::new(actor_entity_uuid)))))
    }
}

fn kratos_admin_url() -> Url {
    Url::parse(
        &std::env::var("HASH_KRATOS_ADMIN_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:4434".to_owned()),
    )
    .expect("the Kratos admin URL should be a valid URL")
}

fn resolver() -> KratosEmailActorResolver<EchoingActorResolver> {
    KratosEmailActorResolver::new(
        KratosAdminConfig {
            kratos_admin_url: kratos_admin_url(),
            http_timeout: Duration::from_secs(10),
        },
        EchoingActorResolver,
    )
}

/// An address that cannot collide with another test or another run.
fn unique_email() -> String {
    format!("graph-contract-{}@example.com", Uuid::new_v4())
}

/// Creates an identity carrying the given address and returns its Kratos ID.
async fn create_identity(
    client: &Client,
    email: &str,
    verified: bool,
    graph_actor_id: Option<ActorEntityUuid>,
) -> Result<String, Box<dyn Error>> {
    let mut identity = json!({
        "schema_id": "default",
        "traits": { "emails": [email] },
        "verifiable_addresses": [{
            "value": email,
            "verified": verified,
            "via": "email",
            "status": if verified { "completed" } else { "pending" },
        }],
    });
    if let Some(actor_id) = graph_actor_id {
        identity
            .as_object_mut()
            .ok_or("the identity payload should be a JSON object")?
            .insert(
                "metadata_public".to_owned(),
                json!({ "graph_actor_id": actor_id }),
            );
    }

    let response = client
        .post(kratos_admin_url().join("admin/identities")?)
        .json(&identity)
        .send()
        .await?
        .error_for_status()?;

    let created: serde_json::Value = response.json().await?;
    Ok(created
        .get("id")
        .and_then(serde_json::Value::as_str)
        .ok_or("the created identity should carry an ID")?
        .to_owned())
}

async fn delete_identity(client: &Client, id: &str) -> Result<(), Box<dyn Error>> {
    client
        .delete(kratos_admin_url().join(&format!("admin/identities/{id}"))?)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

#[tokio::test]
async fn verified_address_resolves_to_the_provisioned_actor() -> Result<(), Box<dyn Error>> {
    let client = Client::new();
    let email = unique_email();
    let actor_id = ActorEntityUuid::new(Uuid::new_v4());
    let identity_id = create_identity(&client, &email, true, Some(actor_id)).await?;

    let resolved = resolver().resolve_email_actor(&email).await;

    delete_identity(&client, &identity_id).await?;

    let user_id = resolved.expect("a verified address should resolve");
    assert_eq!(
        ActorEntityUuid::new(user_id),
        actor_id,
        "the resolver should report the actor named in the identity's metadata"
    );
    Ok(())
}

/// Kratos returns identities whose matching address is still unverified, so the resolver's own
/// check is what stops an unverified address from authenticating as its owner.
#[tokio::test]
async fn unverified_address_does_not_resolve() -> Result<(), Box<dyn Error>> {
    let client = Client::new();
    let email = unique_email();
    let identity_id = create_identity(
        &client,
        &email,
        false,
        Some(ActorEntityUuid::new(Uuid::new_v4())),
    )
    .await?;

    let resolved = resolver().resolve_email_actor(&email).await;

    delete_identity(&client, &identity_id).await?;

    let report = resolved.expect_err("an unverified address should not resolve");
    assert!(
        matches!(
            report.current_context(),
            AuthenticationError::IdentityWithoutActor
        ),
        "an unverified address should fail as an identity without actor, got {:?}",
        report.current_context()
    );
    Ok(())
}

#[tokio::test]
async fn identity_without_graph_actor_does_not_resolve() -> Result<(), Box<dyn Error>> {
    let client = Client::new();
    let email = unique_email();
    let identity_id = create_identity(&client, &email, true, None).await?;

    let resolved = resolver().resolve_email_actor(&email).await;

    delete_identity(&client, &identity_id).await?;

    let report = resolved.expect_err("an unprovisioned identity should not resolve");
    assert!(
        matches!(
            report.current_context(),
            AuthenticationError::NotProvisioned { .. }
        ),
        "an identity without a Graph actor should fail as unprovisioned, got {:?}",
        report.current_context()
    );
    Ok(())
}

#[tokio::test]
async fn address_without_an_identity_does_not_resolve() {
    let report = resolver()
        .resolve_email_actor(&unique_email())
        .await
        .expect_err("an address without an identity should not resolve");

    assert!(
        matches!(
            report.current_context(),
            AuthenticationError::IdentityWithoutActor
        ),
        "an unknown address should fail as an identity without actor, got {:?}",
        report.current_context()
    );
}

/// The lookup is what the Cloudflare Access provider hands a token's email claim, and email
/// comparison is case-insensitive.
#[tokio::test]
async fn address_resolves_regardless_of_case() -> Result<(), Box<dyn Error>> {
    let client = Client::new();
    let email = unique_email();
    let actor_id = ActorEntityUuid::new(Uuid::new_v4());
    let identity_id = create_identity(&client, &email, true, Some(actor_id)).await?;

    let resolved = resolver().resolve_email_actor(&email.to_uppercase()).await;

    delete_identity(&client, &identity_id).await?;

    resolved.expect("an address differing in case should resolve");
    Ok(())
}
