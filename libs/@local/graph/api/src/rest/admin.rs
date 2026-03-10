//! Admin API routes for database management operations.
//!
//! These routes are served on a separate admin port and provide operations like
//! entity deletion, snapshot restoration, and bulk cleanup of ontology types.

use alloc::sync::Arc;

use axum::{
    Extension, Json, Router,
    body::Body,
    extract::FromRequestParts,
    http::request::Parts,
    response::IntoResponse as _,
    routing::{delete, get, post},
};
use error_stack::Report;
use futures::TryStreamExt as _;
use hash_codec::bytes::JsonLinesDecoder;
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hash_graph_postgres_store::{snapshot::SnapshotStore, store::PostgresStorePool};
use hash_graph_store::{
    account::AccountStore as _,
    entity::{DeleteEntitiesParams, DeletionSummary, EntityStore as _},
    pool::StorePool as _,
    user_deletion,
};
use hash_status::{Status, StatusCode};
use serde::Deserialize as _;
use tokio::io;
use tokio_util::{codec::FramedRead, io::StreamReader};
use type_system::principal::actor::{ActorEntityUuid, UserId};
use uuid::Uuid;

use super::{
    AuthenticatedUserHeader, http_tracing_layer,
    jwt::{JwtValidator, OptionalJwtAuthentication},
    status::{BoxedResponse, status_to_response},
};
use crate::{
    email_subscription::MailchimpSubscriptionProvider, identity_provider::KratosIdentityProvider,
    oauth_provider::HydraOAuthProvider, rest::status::report_to_response,
};

/// Configuration for external identity services passed to admin routes.
#[derive(Debug, Clone)]
pub struct ExternalServicesConfig {
    pub kratos_admin_url: reqwest::Url,
    pub hydra_admin_url: reqwest::Url,
    pub mailchimp_api_key: Option<String>,
    pub mailchimp_list_id: Option<String>,
    pub mailchimp_server: Option<String>,
}

/// Creates the admin API router.
///
/// When `jwt_validator` is `Some`, all endpoints except `/health` require a valid
/// JWT token. When `None`, JWT authentication is disabled (development mode).
pub fn routes(
    store_pool: PostgresStorePool,
    jwt_validator: Option<Arc<JwtValidator>>,
    external_services: ExternalServicesConfig,
) -> Router {
    let public = Router::new().route("/health", get(async || "Healthy"));

    let mut protected = Router::new()
        .route("/snapshot", post(restore_snapshot))
        .route("/accounts", delete(delete_accounts))
        .route("/data-types", delete(delete_data_types))
        .route("/property-types", delete(delete_property_types))
        .route("/entity-types", delete(delete_entity_types))
        .route("/entities/delete", post(delete_entities))
        .route("/users/delete", post(delete_user));

    if let Some(validator) = jwt_validator {
        protected = protected.layer(Extension(validator));
    }

    public
        .merge(protected)
        .layer(http_tracing_layer::HttpTracingLayer)
        .layer(Extension(Arc::new(store_pool)))
        .layer(Extension(Arc::new(external_services)))
        .layer(Extension(Arc::new(reqwest::Client::new())))
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
enum AdminActorError {
    #[display("JWT claims do not contain an email address")]
    MissingEmail,
    #[display("no user account found for the authenticated email")]
    UserNotFound,
    #[display("store pool not configured on admin routes")]
    StorePoolNotConfigured,
}

/// Resolves the authenticated admin actor from JWT claims.
///
/// When JWT authentication is configured, resolves the actor ID by looking up the email from the
/// token claims. When JWT is disabled (dev mode), falls back to the `X-Authenticated-User-Actor-Id`
/// header.
struct AdminActorId(AuthenticatedActor);

impl<S: Sync> FromRequestParts<S> for AdminActorId {
    type Rejection = BoxedResponse;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let jwt = OptionalJwtAuthentication::from_request_parts(parts, state).await?;

        let Some(claims) = jwt.0 else {
            // No JWT configured (dev mode) — fall back to header
            let AuthenticatedUserHeader(actor_id) =
                AuthenticatedUserHeader::from_request_parts(parts, state)
                    .await
                    .map_err(|rejection| BoxedResponse::from(rejection.into_response()))?;
            return Ok(Self(actor_id.into()));
        };

        let email = claims.email.ok_or_else(|| {
            report_to_response(
                Report::new(AdminActorError::MissingEmail).attach(StatusCode::Unauthenticated),
            )
        })?;

        let pool = parts
            .extensions
            .get::<Arc<PostgresStorePool>>()
            .ok_or_else(|| {
                report_to_response(
                    Report::new(AdminActorError::StorePoolNotConfigured)
                        .attach(StatusCode::Internal),
                )
            })?;

        let user_id = pool
            .acquire(None)
            .await
            .map_err(report_to_response)?
            .get_user_id_by_email(&email)
            .await
            .map_err(report_to_response)?
            .ok_or_else(|| {
                report_to_response(
                    Report::new(AdminActorError::UserNotFound).attach(StatusCode::PermissionDenied),
                )
            })?;

        Ok(Self(user_id.into()))
    }
}

async fn restore_snapshot(
    jwt: OptionalJwtAuthentication,
    store_pool: Extension<Arc<PostgresStorePool>>,
    snapshot: Body,
) -> Result<BoxedResponse, BoxedResponse> {
    tracing::info!(
        sub = jwt.0.as_ref().map(|claims| claims.sub.as_str()),
        email = jwt.0.as_ref().and_then(|claims| claims.email.as_deref()),
        "Admin: restoring snapshot"
    );

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

async fn delete_accounts(
    jwt: OptionalJwtAuthentication,
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    tracing::info!(
        sub = jwt.0.as_ref().map(|claims| claims.sub.as_str()),
        email = jwt.0.as_ref().and_then(|claims| claims.email.as_deref()),
        "Admin: deleting all accounts"
    );

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

async fn delete_data_types(
    jwt: OptionalJwtAuthentication,
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    tracing::info!(
        sub = jwt.0.as_ref().map(|claims| claims.sub.as_str()),
        email = jwt.0.as_ref().and_then(|claims| claims.email.as_deref()),
        "Admin: deleting all data types"
    );

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

async fn delete_property_types(
    jwt: OptionalJwtAuthentication,
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    tracing::info!(
        sub = jwt.0.as_ref().map(|claims| claims.sub.as_str()),
        email = jwt.0.as_ref().and_then(|claims| claims.email.as_deref()),
        "Admin: deleting all property types"
    );

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

async fn delete_entity_types(
    jwt: OptionalJwtAuthentication,
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    tracing::info!(
        sub = jwt.0.as_ref().map(|claims| claims.sub.as_str()),
        email = jwt.0.as_ref().and_then(|claims| claims.email.as_deref()),
        "Admin: deleting all entity types"
    );

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
async fn delete_entities(
    AdminActorId(actor_id): AdminActorId,
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
        .delete_entities(actor_id, params)
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
    AdminActorId(actor_id): AdminActorId,
    pool: Extension<Arc<PostgresStorePool>>,
    external_services: Extension<Arc<ExternalServicesConfig>>,
    http_client: Extension<Arc<reqwest::Client>>,
    Json(request): Json<DeleteUserRequest>,
) -> Result<BoxedResponse, BoxedResponse> {
    let mut store = pool.acquire(None).await.map_err(report_to_response)?;

    let user_id = match request {
        DeleteUserRequest::ById { user_id } => UserId::new(user_id),
        DeleteUserRequest::ByEmail { email } => {
            tracing::info!(%email, "resolving user by email");
            store
                .get_user_id_by_email(&email)
                .await
                .map_err(report_to_response)?
                .ok_or_else(|| {
                    report_to_response(
                        Report::new(AdminActorError::UserNotFound).attach(StatusCode::NotFound),
                    )
                })?
        }
    };
    tracing::info!(%user_id, "user deletion requested");

    let kratos = KratosIdentityProvider::new(
        Arc::clone(&http_client),
        external_services.kratos_admin_url.clone(),
    );

    let hydra = HydraOAuthProvider::new(
        Arc::clone(&http_client),
        external_services.hydra_admin_url.clone(),
    );

    let mailchimp = match (
        &external_services.mailchimp_api_key,
        &external_services.mailchimp_list_id,
        &external_services.mailchimp_server,
    ) {
        (Some(api_key), Some(list_id), Some(server)) => Some(MailchimpSubscriptionProvider::new(
            Arc::clone(&http_client),
            api_key.clone(),
            list_id.clone(),
            server.clone(),
        )),
        _ => None,
    };

    let report = user_deletion::delete_user(
        &mut store,
        &kratos,
        &hydra,
        mailchimp.as_ref(),
        actor_id,
        user_id,
    )
    .await
    .map_err(report_to_response)?;

    Ok(status_to_response(Status::new(
        StatusCode::Ok,
        Some("User deleted successfully".to_owned()),
        vec![report],
    )))
}
