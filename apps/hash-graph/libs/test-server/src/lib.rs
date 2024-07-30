extern crate alloc;

use alloc::sync::Arc;
use std::collections::HashMap;

use authorization::{
    backend::ZanzibarBackend,
    schema::{
        AccountGroupNamespace, DataTypeNamespace, EntityNamespace, EntityTypeNamespace,
        PropertyTypeNamespace, WebNamespace,
    },
    zanzibar::types::{RelationshipFilter, ResourceFilter},
    AuthorizationApi,
};
use axum::{
    body::Body,
    response::Response,
    routing::{delete, post},
    Extension, Router,
};
use error_stack::{Context, Report};
use futures::TryStreamExt;
use graph::{
    snapshot::SnapshotStore,
    store::{PostgresStorePool, StorePool},
};
use graph_api::{
    error::{ErrorInfo, StatusPayloads},
    rest::{middleware::span_trace_layer, status::status_to_response},
};
use graph_types::account::AccountId;
use hash_status::{Status, StatusCode};
use tokio::io;
use tokio_util::{codec::FramedRead, io::StreamReader};
use uuid::Uuid;

/// Create routes for interacting with entities.
pub fn routes<A>(store_pool: PostgresStorePool, authorization_api: A) -> Router
where
    A: AuthorizationApi + ZanzibarBackend + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/snapshot", post(restore_snapshot::<A>))
        .route("/accounts", delete(delete_accounts::<A>))
        .route("/data-types", delete(delete_data_types::<A>))
        .route("/property-types", delete(delete_property_types::<A>))
        .route("/entity-types", delete(delete_entity_types::<A>))
        .route("/entities", delete(delete_entities::<A>))
        .layer(Extension(Arc::new(store_pool)))
        .layer(Extension(Arc::new(authorization_api)))
        .layer(span_trace_layer())
}

#[expect(
    clippy::needless_pass_by_value,
    reason = "This is used inside of error-mapping functions only"
)]
fn store_acquisition_error(report: Report<impl Context>) -> Response {
    tracing::error!(error=?report, "Could not acquire store");
    status_to_response(Status::new(
        StatusCode::Internal,
        Some(format!(
            "{report}\n\nThis is an internal error, please report to the developers of the HASH \
             Graph with whatever information you can provide including request details and logs."
        )),
        vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
            // TODO: add information from the report here
            //   see https://linear.app/hash/issue/H-3009
            HashMap::new(),
            // TODO: We should encapsulate these Reasons within the type system, perhaps
            //       requiring top level contexts to implement a trait `ErrorReason::to_reason`
            //       or perhaps as a big enum, or as an attachment
            "STORE_ACQUISITION_FAILURE".to_owned(),
        ))],
    ))
}

fn report_to_response<C>(report: &Report<C>, code: impl Into<String>) -> Response {
    status_to_response(Status::new(
        report
            .request_ref::<StatusCode>()
            .copied()
            .next()
            .unwrap_or(StatusCode::Unknown),
        Some(report.to_string()),
        vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
            HashMap::new(),
            code.into(),
        ))],
    ))
}

async fn restore_snapshot<A>(
    store_pool: Extension<Arc<PostgresStorePool>>,
    authorization_api: Extension<Arc<A>>,
    snapshot: Body,
) -> Result<Response, Response>
where
    A: AuthorizationApi + ZanzibarBackend + Send + Sync + Clone,
{
    let store = store_pool
        .acquire((**authorization_api).clone(), None)
        .await
        .map_err(store_acquisition_error)?;

    SnapshotStore::new(store)
        .restore_snapshot(
            FramedRead::new(
                StreamReader::new(
                    snapshot
                        .into_data_stream()
                        .map_err(|err| io::Error::new(io::ErrorKind::Other, err)),
                ),
                codec::bytes::JsonLinesDecoder::default(),
            ),
            10_000,
            true,
        )
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not restore snapshot");
            report_to_response(&report, "SNAPSHOT_RESTORATION_FAILURE")
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Snapshot restored successfully".to_owned()),
        vec![],
    )))
}

async fn delete_accounts<A>(
    pool: Extension<Arc<PostgresStorePool>>,
    authorization_api: Extension<Arc<A>>,
) -> Result<Response, Response>
where
    A: AuthorizationApi + ZanzibarBackend + Clone,
{
    let mut authorization_api = (**authorization_api).clone();

    authorization_api
        .delete_relations(RelationshipFilter::from_resource(
            ResourceFilter::from_kind(WebNamespace::Web),
        ))
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete web relationships");
            report_to_response(&report, "ACCOUNT_DELETION_FAILURE")
        })?;

    authorization_api
        .delete_relations(RelationshipFilter::from_resource(
            ResourceFilter::from_kind(AccountGroupNamespace::AccountGroup),
        ))
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete account group relationships");
            report_to_response(&report, "ACCOUNT_DELETION_FAILURE")
        })?;

    pool.acquire(authorization_api, None)
        .await
        .map_err(store_acquisition_error)?
        .delete_accounts(AccountId::new(Uuid::nil()))
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete accounts");
            report_to_response(&report, "ACCOUNT_DELETION_FAILURE")
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Accounts deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_data_types<A>(
    pool: Extension<Arc<PostgresStorePool>>,
    authorization_api: Extension<Arc<A>>,
) -> Result<Response, Response>
where
    A: AuthorizationApi + ZanzibarBackend + Clone,
{
    let mut authorization_api = (**authorization_api).clone();

    authorization_api
        .delete_relations(RelationshipFilter::from_resource(
            ResourceFilter::from_kind(DataTypeNamespace::DataType),
        ))
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete data type relationships");
            report_to_response(&report, "DATA_TYPE_DELETION_FAILURE")
        })?;

    pool.acquire(authorization_api, None)
        .await
        .map_err(store_acquisition_error)?
        .delete_data_types()
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete data types");
            status_to_response(Status::new(
                report
                    .request_ref::<StatusCode>()
                    .copied()
                    .next()
                    .unwrap_or(StatusCode::Unknown),
                Some(report.to_string()),
                vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
                    HashMap::new(),
                    "DATA_TYPE_DELETION_FAILURE".to_owned(),
                ))],
            ))
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Data types deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_property_types<A>(
    pool: Extension<Arc<PostgresStorePool>>,
    authorization_api: Extension<Arc<A>>,
) -> Result<Response, Response>
where
    A: AuthorizationApi + ZanzibarBackend + Clone,
{
    let mut authorization_api = (**authorization_api).clone();

    authorization_api
        .delete_relations(RelationshipFilter::from_resource(
            ResourceFilter::from_kind(PropertyTypeNamespace::PropertyType),
        ))
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete property type relationships");
            report_to_response(&report, "PROPERTY_TYPE_DELETION_FAILURE")
        })?;

    pool.acquire(authorization_api, None)
        .await
        .map_err(store_acquisition_error)?
        .delete_property_types()
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete property types");
            report_to_response(&report, "PROPERTY_TYPE_DELETION_FAILURE")
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Property types deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_entity_types<A>(
    pool: Extension<Arc<PostgresStorePool>>,
    authorization_api: Extension<Arc<A>>,
) -> Result<Response, Response>
where
    A: AuthorizationApi + ZanzibarBackend + Clone,
{
    let mut authorization_api = (**authorization_api).clone();

    authorization_api
        .delete_relations(RelationshipFilter::from_resource(
            ResourceFilter::from_kind(EntityTypeNamespace::EntityType),
        ))
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete entity type relationships");
            report_to_response(&report, "ENTITY_TYPE_DELETION_FAILURE")
        })?;

    pool.acquire(authorization_api, None)
        .await
        .map_err(store_acquisition_error)?
        .delete_entity_types()
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete entity types");
            report_to_response(&report, "ENTITY_TYPE_DELETION_FAILURE")
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Entity types deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_entities<A>(
    pool: Extension<Arc<PostgresStorePool>>,
    authorization_api: Extension<Arc<A>>,
) -> Result<Response, Response>
where
    A: AuthorizationApi + ZanzibarBackend + Clone,
{
    let mut authorization_api = (**authorization_api).clone();

    authorization_api
        .delete_relations(RelationshipFilter::from_resource(
            ResourceFilter::from_kind(EntityNamespace::Entity),
        ))
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete entity relationships");
            report_to_response(&report, "ENTITY_DELETION_FAILURE")
        })?;

    pool.acquire(authorization_api, None)
        .await
        .map_err(store_acquisition_error)?
        .delete_entities()
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete entities");
            report_to_response(&report, "ENTITY_DELETION_FAILURE")
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Entities deleted successfully".to_owned()),
        vec![],
    )))
}
