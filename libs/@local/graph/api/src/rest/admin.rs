//! Admin API routes for database management operations.
//!
//! Served on a dedicated port (default: 4001, configured via `HASH_GRAPH_ADMIN_PORT`), separate
//! from the main Graph API.
//!
//! # Endpoints
//!
//! | Method   | Path               | Availability                   |
//! |----------|--------------------|--------------------------------|
//! | `GET`    | `/health`          | Always                         |
//! | `POST`   | `/entities/delete` | Always                         |
//! | `POST`   | `/users/delete`    | Always                         |
//! | `POST`   | `/snapshot`        | `unsafe-dev-endpoints` feature |
//! | `DELETE` | `/accounts`        | `unsafe-dev-endpoints` feature |
//! | `DELETE` | `/data-types`      | `unsafe-dev-endpoints` feature |
//! | `DELETE` | `/entity-types`    | `unsafe-dev-endpoints` feature |
//! | `DELETE` | `/property-types`  | `unsafe-dev-endpoints` feature |
//!
//! # Authentication
//!
//! All routes except `/health` run behind [`auth::authentication_middleware`], with the operator
//! chain: Cloudflare Access JWT, then service delegation. A Kratos session does **not**
//! authenticate here — these endpoints erase entities and delete users, and the handlers do not
//! authorize beyond requiring some actor, so operators arrive through Access and internal services
//! through the shared secret.
//!
//! # Operational runbook
//!
//! See the [Graph Admin API] Notion page for access instructions and troubleshooting.
//! **Update that page when endpoints or authentication behaviour change.**
//!
//! [Graph Admin API]: https://www.notion.so/hashintel/Graph-Admin-API-31a3c81fe02480f792c9d7bedfdc49db

use alloc::sync::Arc;

use axum::{Extension, Json, Router, routing::post};
#[cfg(feature = "unsafe-dev-endpoints")]
use axum::{body::Body, routing::delete};
use error_stack::Report;
#[cfg(feature = "unsafe-dev-endpoints")]
use futures::TryStreamExt as _;
#[cfg(feature = "unsafe-dev-endpoints")]
use hash_codec::bytes::JsonLinesDecoder;
use hash_graph_authentication::provider::AuthenticationProvider;
#[cfg(feature = "unsafe-dev-endpoints")]
use hash_graph_postgres_store::snapshot::SnapshotStore;
use hash_graph_postgres_store::store::PostgresStorePool;
use hash_graph_store::{
    entity::{DeleteEntitiesParams, DeletionSummary, EntityStore as _},
    pool::StorePool as _,
    user_deletion::{self, UserDeletionError},
};
use hash_status::{Status, StatusCode};
use serde::Deserialize as _;
#[cfg(feature = "unsafe-dev-endpoints")]
use tokio::io;
#[cfg(feature = "unsafe-dev-endpoints")]
use tokio_util::{codec::FramedRead, io::StreamReader};
#[cfg(feature = "unsafe-dev-endpoints")]
use type_system::principal::actor::ActorEntityUuid;
use type_system::principal::actor::UserId;
use uuid::Uuid;

use super::{
    AuthenticatedActorId, auth, http_tracing_layer, probe,
    status::{BoxedResponse, status_to_response},
};
use crate::{
    email_subscription::MailchimpSubscriptionProvider,
    identity_provider::{EmailLookupError, KratosIdentityProvider},
    oauth_provider::HydraOAuthProvider,
    rest::status::report_to_response,
};

/// HTTP timeout for the Kratos admin client.
const KRATOS_HTTP_TIMEOUT: core::time::Duration = core::time::Duration::from_secs(10);

/// Configuration for external identity services passed to admin routes.
#[derive(Debug, Clone)]
pub struct ExternalServicesConfig {
    pub kratos_admin_url: reqwest::Url,
    pub hydra_admin_url: reqwest::Url,
    pub mailchimp_api_key: Option<String>,
    pub mailchimp_list_id: Option<String>,
}

/// Creates the admin API router.
///
/// All routes except `/health` require authentication through the given provider chain. The bulk
/// destructive endpoints (`/snapshot`, `/accounts`, `/data-types`, `/property-types`,
/// `/entity-types`) exist only in builds with the `unsafe-dev-endpoints` feature.
pub fn routes<P>(
    store_pool: Arc<PostgresStorePool>,
    authentication_provider: Arc<P>,
    service_secret: Arc<str>,
    external_services: ExternalServicesConfig,
) -> Router
where
    P: AuthenticationProvider + 'static,
{
    let protected = Router::new()
        .route("/entities/delete", post(delete_entities))
        .route("/users/delete", post(delete_user));

    #[cfg(feature = "unsafe-dev-endpoints")]
    let protected = protected
        .route("/snapshot", post(restore_snapshot))
        .route("/accounts", delete(delete_accounts))
        .route("/data-types", delete(delete_data_types))
        .route("/property-types", delete(delete_property_types))
        .route("/entity-types", delete(delete_entity_types));

    let kratos = Arc::new(KratosIdentityProvider::new(
        external_services.kratos_admin_url.clone(),
        KRATOS_HTTP_TIMEOUT,
    ));

    probe::router()
        .merge(
            protected.route_layer(axum::middleware::from_fn(move |request, next| {
                let provider = Arc::clone(&authentication_provider);
                let service_secret = Arc::clone(&service_secret);
                auth::authentication_middleware(provider, service_secret, request, next)
            })),
        )
        .fallback(|| async {
            status_to_response(Status::<()>::new(
                StatusCode::NotFound,
                Some("endpoint not found".to_owned()),
                vec![],
            ))
        })
        .layer(http_tracing_layer::HttpTracingLayer)
        .layer(Extension(store_pool))
        .layer(Extension(Arc::new(external_services)))
        .layer(Extension(kratos))
        .layer(Extension(Arc::new(reqwest::Client::new())))
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
enum AdminError {
    #[display("no user account found for the given email")]
    UserNotFound,
}

/// Restores a snapshot from a JSON Lines stream, replacing all existing data.
///
/// See [`SnapshotStore::restore_snapshot`] for details.
#[cfg(feature = "unsafe-dev-endpoints")]
async fn restore_snapshot(
    AuthenticatedActorId(actor_id): AuthenticatedActorId,
    store_pool: Extension<Arc<PostgresStorePool>>,
    snapshot: Body,
) -> Result<BoxedResponse, BoxedResponse> {
    tracing::info!(%actor_id, "restoring snapshot");
    let store = store_pool.acquire(None).await.map_err(report_to_response)?;

    SnapshotStore::new(store)
        .restore_snapshot(
            FramedRead::new(
                StreamReader::new(snapshot.into_data_stream().map_err(io::Error::other)),
                JsonLinesDecoder::default(),
            ),
            10_000,
            false,
        )
        .await
        .map_err(report_to_response)?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Snapshot restored successfully".to_owned()),
        vec![],
    )))
}

/// Deletes **all** accounts.
///
/// See [`PostgresStore::delete_principals`] for details.
///
/// [`PostgresStore::delete_principals`]: hash_graph_postgres_store::store::PostgresStore::delete_principals
#[cfg(feature = "unsafe-dev-endpoints")]
async fn delete_accounts(
    AuthenticatedActorId(actor_id): AuthenticatedActorId,
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    tracing::info!(%actor_id, "deleting all accounts");
    pool.acquire(None)
        .await
        .map_err(report_to_response)?
        .delete_principals(ActorEntityUuid::new(Uuid::nil()))
        .await
        .map_err(report_to_response)?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Accounts deleted successfully".to_owned()),
        vec![],
    )))
}

/// Deletes **all** data types.
///
/// See [`PostgresStore::delete_data_types`] for details.
///
/// [`PostgresStore::delete_data_types`]: hash_graph_postgres_store::store::PostgresStore::delete_data_types
#[cfg(feature = "unsafe-dev-endpoints")]
async fn delete_data_types(
    AuthenticatedActorId(actor_id): AuthenticatedActorId,
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    tracing::info!(%actor_id, "deleting all data types");
    pool.acquire(None)
        .await
        .map_err(report_to_response)?
        .delete_data_types()
        .await
        .map_err(report_to_response)?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Data types deleted successfully".to_owned()),
        vec![],
    )))
}

/// Deletes **all** property types.
///
/// See [`PostgresStore::delete_property_types`] for details.
///
/// [`PostgresStore::delete_property_types`]: hash_graph_postgres_store::store::PostgresStore::delete_property_types
#[cfg(feature = "unsafe-dev-endpoints")]
async fn delete_property_types(
    AuthenticatedActorId(actor_id): AuthenticatedActorId,
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    tracing::info!(%actor_id, "deleting all property types");
    pool.acquire(None)
        .await
        .map_err(report_to_response)?
        .delete_property_types()
        .await
        .map_err(report_to_response)?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Property types deleted successfully".to_owned()),
        vec![],
    )))
}

/// Deletes **all** entity types.
///
/// See [`PostgresStore::delete_entity_types`] for details.
///
/// [`PostgresStore::delete_entity_types`]: hash_graph_postgres_store::store::PostgresStore::delete_entity_types
#[cfg(feature = "unsafe-dev-endpoints")]
async fn delete_entity_types(
    AuthenticatedActorId(actor_id): AuthenticatedActorId,
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    tracing::info!(%actor_id, "deleting all entity types");
    pool.acquire(None)
        .await
        .map_err(report_to_response)?
        .delete_entity_types()
        .await
        .map_err(report_to_response)?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Entity types deleted successfully".to_owned()),
        vec![],
    )))
}

/// Deletes entities matching the given filter and scope with full provenance tracking.
///
/// See [`EntityStore::delete_entities`] for behavioral details, scoping rules, and error
/// conditions.
///
/// [`EntityStore::delete_entities`]: hash_graph_store::entity::EntityStore::delete_entities
async fn delete_entities(
    AuthenticatedActorId(actor_id): AuthenticatedActorId,
    pool: Extension<Arc<PostgresStorePool>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<DeletionSummary>, BoxedResponse> {
    // Deserialize into `Value` first so that `DeleteEntitiesParams` (which borrows via
    // `Filter<'a>`) can reference the owned data. `Json<DeleteEntitiesParams>` would not compile
    // because the borrowed data would be dropped before use.
    let params = DeleteEntitiesParams::deserialize(&body).map_err(|error| {
        report_to_response(Report::new(error).attach(StatusCode::InvalidArgument))
    })?;

    pool.acquire(None)
        .await
        .map_err(report_to_response)?
        .delete_entities(actor_id.into(), params)
        .await
        .map(Json)
        .map_err(report_to_response)
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all_fields = "camelCase", untagged)]
enum DeleteUserRequest {
    ById { user_id: Uuid },
    ByEmail { email: String },
}

async fn delete_user(
    AuthenticatedActorId(actor_id): AuthenticatedActorId,
    pool: Extension<Arc<PostgresStorePool>>,
    external_services: Extension<Arc<ExternalServicesConfig>>,
    kratos: Extension<Arc<KratosIdentityProvider>>,
    http_client: Extension<Arc<reqwest::Client>>,
    Json(request): Json<DeleteUserRequest>,
) -> Result<BoxedResponse, BoxedResponse> {
    let mut store = pool.acquire(None).await.map_err(report_to_response)?;

    let (user_id, kratos_identity_id) = match request {
        DeleteUserRequest::ById { user_id } => (UserId::new(user_id), None),
        DeleteUserRequest::ByEmail { email } => {
            let resolved = kratos
                .find_user_by_email(&email)
                .await
                .map_err(|report| {
                    let code = match report.current_context() {
                        EmailLookupError::EmptyEmail => StatusCode::InvalidArgument,
                        EmailLookupError::NotProvisioned { .. }
                        | EmailLookupError::AmbiguousEmail { .. } => StatusCode::FailedPrecondition,
                        EmailLookupError::LookupFailed => StatusCode::Unavailable,
                    };
                    report_to_response(report.attach(code))
                })?
                .ok_or_else(|| {
                    report_to_response(
                        Report::new(AdminError::UserNotFound).attach(StatusCode::NotFound),
                    )
                })?;
            (resolved.user_id, Some(resolved.kratos_identity_id))
        }
    };
    tracing::info!(%user_id, "user deletion requested");

    let hydra = HydraOAuthProvider::new(
        Arc::clone(&http_client),
        external_services.hydra_admin_url.clone(),
    );

    let mailchimp = match (
        &external_services.mailchimp_api_key,
        &external_services.mailchimp_list_id,
    ) {
        (Some(api_key), Some(list_id)) => Some(
            MailchimpSubscriptionProvider::new(
                Arc::clone(&http_client),
                api_key.clone(),
                list_id.clone(),
            )
            .map_err(report_to_response)?,
        ),
        _ => None,
    };

    let outcome = user_deletion::delete_user(
        &mut store,
        kratos.as_ref(),
        &hydra,
        mailchimp.as_ref(),
        actor_id.into(),
        user_id,
        kratos_identity_id,
    )
    .await
    .map_err(|report| {
        // Only the fatal variants can reach this path; the non-fatal ones are collected into
        // the outcome.
        let code = match report.current_context() {
            UserDeletionError::UserLookup => StatusCode::Unavailable,
            UserDeletionError::MissingKratosIdentityId => StatusCode::FailedPrecondition,
            UserDeletionError::EntityDeletion
            | UserDeletionError::KratosDeletion
            | UserDeletionError::UnknownIdentity
            | UserDeletionError::HydraLoginRevocation
            | UserDeletionError::HydraConsentRevocation
            | UserDeletionError::EmailSubscription
            | UserDeletionError::UnknownEmailAddresses => StatusCode::Internal,
        };
        report_to_response(report.attach(code))
    })?;

    let message = if outcome.errors.is_ok() {
        "User deleted successfully"
    } else {
        "User deleted with external service errors, check report"
    };

    Ok(status_to_response(Status::new(
        StatusCode::Ok,
        Some(message.to_owned()),
        vec![outcome.report],
    )))
}
