//! Admin API routes for database management operations.
//!
//! Served on a dedicated port (default: 4001, configured via `HASH_GRAPH_ADMIN_PORT`), separate
//! from the main Graph API.
//!
//! # Endpoints
//!
//! | Method   | Path               | Auth | Availability             |
//! |----------|--------------------|------|--------------------------|
//! | `GET`    | `/health`          | —    | Always                   |
//! | `POST`   | `/entities/delete` | JWT  | Always                   |
//! | `POST`   | `/snapshot`        | —    | Only without JWT         |
//! | `DELETE` | `/accounts`        | —    | Only without JWT         |
//! | `DELETE` | `/data-types`      | —    | Only without JWT         |
//! | `DELETE` | `/property-types`  | —    | Only without JWT         |
//! | `DELETE` | `/entity-types`    | —    | Only without JWT         |
//!
//! # Authentication
//!
//! JWT tokens are extracted from headers in order:
//! 1. `Cf-Access-Jwt-Assertion` (Cloudflare Access)
//! 2. `Authorization: Bearer <token>`
//!
//! When JWT is configured (`--jwt-jwks-url`), the token's `email` claim is resolved to a HASH
//! user actor for provenance tracking on `/entities/delete`. When JWT is not configured, the
//! `X-Authenticated-User-Actor-Id` header is used instead.
//!
//! See [`super::jwt`] for validation details.
//!
//! # Operational runbook
//!
//! See the [Graph Admin API] Notion page for access instructions and troubleshooting.
//! **Update that page when endpoints or authentication behaviour change.**
//!
//! [Graph Admin API]: https://www.notion.so/hashintel/Graph-Admin-API-31a3c81fe02480f792c9d7bedfdc49db

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
};
use hash_status::{Status, StatusCode};
use serde::Deserialize as _;
use tokio::io;
use tokio_util::{codec::FramedRead, io::StreamReader};
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use super::{
    AuthenticatedUserHeader, http_tracing_layer,
    jwt::{JwtValidator, OptionalJwtAuthentication},
    status::{BoxedResponse, status_to_response},
};
use crate::rest::status::report_to_response;

/// Creates the admin API router.
///
/// When `jwt_validator` is `Some`, only `/health` and `/entities/delete` are available.
/// Bulk destructive endpoints (`/snapshot`, `/accounts`, `/data-types`, `/property-types`,
/// `/entity-types`) are only registered when JWT is **not** configured.
pub fn routes(store_pool: PostgresStorePool, jwt_validator: Option<Arc<JwtValidator>>) -> Router {
    // Health endpoint is always public (used by load balancers and healthchecks)
    let public = Router::new().route("/health", get(async || "Healthy"));

    let mut protected = Router::new().route("/entities/delete", post(delete_entities));

    if let Some(validator) = jwt_validator {
        protected = protected.layer(Extension(validator));
    } else {
        // Bulk destructive endpoints are only available when JWT is not configured.
        // In production/staging (JWT enabled), these are disabled to prevent accidental
        // data loss — use snapshots or targeted entity deletion instead.
        protected = protected
            .route("/snapshot", post(restore_snapshot))
            .route("/accounts", delete(delete_accounts))
            .route("/data-types", delete(delete_data_types))
            .route("/property-types", delete(delete_property_types))
            .route("/entity-types", delete(delete_entity_types));
    }

    public
        .merge(protected)
        .layer(http_tracing_layer::HttpTracingLayer)
        .layer(Extension(Arc::new(store_pool)))
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
/// token claims. When JWT is not configured, falls back to the `X-Authenticated-User-Actor-Id`
/// header.
struct AdminActorId(AuthenticatedActor);

impl<S: Sync> FromRequestParts<S> for AdminActorId {
    type Rejection = BoxedResponse;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let jwt = OptionalJwtAuthentication::from_request_parts(parts, state).await?;

        let Some(claims) = jwt.0 else {
            // No JWT configured — fall back to header
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

/// Restores a snapshot from a JSON Lines stream, replacing all existing data.
///
/// Only available when JWT is not configured. See [`SnapshotStore::restore_snapshot`] for details.
async fn restore_snapshot(
    store_pool: Extension<Arc<PostgresStorePool>>,
    snapshot: Body,
) -> Result<BoxedResponse, BoxedResponse> {
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

/// Deletes **all** accounts. Only available when JWT is not configured.
///
/// See [`PostgresStore::delete_principals`] for details.
///
/// [`PostgresStore::delete_principals`]: hash_graph_postgres_store::store::PostgresStore::delete_principals
async fn delete_accounts(
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
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

/// Deletes **all** data types. Only available when JWT is not configured.
///
/// See [`PostgresStore::delete_data_types`] for details.
///
/// [`PostgresStore::delete_data_types`]: hash_graph_postgres_store::store::PostgresStore::delete_data_types
async fn delete_data_types(
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
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

/// Deletes **all** property types. Only available when JWT is not configured.
///
/// See [`PostgresStore::delete_property_types`] for details.
///
/// [`PostgresStore::delete_property_types`]: hash_graph_postgres_store::store::PostgresStore::delete_property_types
async fn delete_property_types(
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
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

/// Deletes **all** entity types. Only available when JWT is not configured.
///
/// See [`PostgresStore::delete_entity_types`] for details.
///
/// [`PostgresStore::delete_entity_types`]: hash_graph_postgres_store::store::PostgresStore::delete_entity_types
async fn delete_entity_types(
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
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
