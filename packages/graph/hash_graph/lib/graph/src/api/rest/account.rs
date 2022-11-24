//! Web routes for CRU operations on accounts.

use std::sync::Arc;

use axum::{http::StatusCode, routing::post, Extension, Json, Router};
use utoipa::OpenApi;
use uuid::Uuid;

use super::api_resource::RoutedResource;
use crate::{
    identifier::account::AccountId,
    store::{AccountStore, StorePool},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_account_id,
    ),
    components(
        schemas(AccountId),
    ),
    tags(
        (name = "Account", description = "Account management API")
    )
)]
pub struct AccountResource;

impl RoutedResource for AccountResource {
    /// Create routes for interacting with accounts.
    fn routes<P: StorePool + Send + 'static>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/accounts",
            Router::new().route("/", post(create_account_id::<P>)),
        )
    }
}

#[utoipa::path(
    post,
    path = "/accounts",
    tag = "Account",
    responses(
        (status = 201, content_type = "application/json", description = "The schema of the created account", body = AccountId),

        (status = 500, description = "Store error occurred"),
    )
)]
async fn create_account_id<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
) -> Result<Json<AccountId>, StatusCode> {
    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let account_id = AccountId::new(Uuid::new_v4());
    store
        .insert_account_id(account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create account id");

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(account_id))
}
