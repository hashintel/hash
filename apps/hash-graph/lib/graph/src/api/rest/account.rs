//! Web routes for CRU operations on accounts.

#![expect(clippy::str_to_string)]

use std::sync::Arc;

use authorization::{
    schema::OwnerId, zanzibar::Consistency, AuthorizationApi, AuthorizationApiPool,
};
use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Extension, Router,
};
use graph_types::{
    account::{AccountGroupId, AccountId},
    provenance::OwnedById,
};
use utoipa::OpenApi;
use uuid::Uuid;

use super::api_resource::RoutedResource;
use crate::{
    api::rest::{json::Json, AuthenticatedUserHeader, PermissionResponse},
    store::{AccountStore, StorePool},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_account,
        create_account_group,

        can_add_group_owner,
        add_account_group_owner,

        can_remove_group_owner,
        remove_account_group_owner,

        can_add_group_admin,
        add_account_group_admin,

        can_remove_group_admin,
        remove_account_group_admin,

        can_add_group_member,
        add_account_group_member,

        can_remove_group_member,
        remove_account_group_member,
    ),
    components(
        schemas(AccountId, AccountGroupId),
    ),
    tags(
        (name = "Account", description = "Account management API")
    )
)]
pub struct AccountResource;

impl RoutedResource for AccountResource {
    /// Create routes for interacting with accounts.
    fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new()
            .route("/accounts", post(create_account::<S, A>))
            .nest(
                "/account_groups",
                Router::new()
                    .route("/", post(create_account_group::<S, A>))
                    .nest(
                        "/:account_group_id",
                        Router::new()
                            .route(
                                "/owners/:account_id",
                                post(add_account_group_owner::<A>)
                                    .delete(remove_account_group_owner::<A>),
                            )
                            .route(
                                "/admins/:account_id",
                                post(add_account_group_admin::<A>)
                                    .delete(remove_account_group_admin::<A>),
                            )
                            .route(
                                "/members/:account_id",
                                post(add_account_group_member::<A>)
                                    .delete(remove_account_group_member::<A>),
                            )
                            .nest(
                                "/permissions",
                                Router::new()
                                    .route("/add_owner", get(can_add_group_owner::<A>))
                                    .route("/remove_owner", get(can_remove_group_owner::<A>))
                                    .route("/add_admin", get(can_add_group_admin::<A>))
                                    .route("/remove_admin", get(can_remove_group_admin::<A>))
                                    .route("/add_member", get(can_add_group_member::<A>))
                                    .route("/remove_member", get(can_remove_group_member::<A>)),
                            ),
                    ),
            )
    }
}

#[utoipa::path(
    post,
    path = "/accounts",
    tag = "Account",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the created account", body = AccountId),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn create_account<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<AccountId>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let account_id = AccountId::new(Uuid::new_v4());
    store
        .insert_account_id(actor_id, &mut authorization_api, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create account id");

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(account_id))
}

#[utoipa::path(
    post,
    path = "/account_groups",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the created account", body = AccountGroupId),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn create_account_group<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<AccountGroupId>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let account = store
        .identify_owned_by_id(OwnedById::from(actor_id))
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not identify account");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    if account != OwnerId::Account(actor_id) {
        tracing::error!("Account does not exist in the graph");
        return Err(StatusCode::NOT_FOUND);
    }

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let account_group_id = AccountGroupId::new(Uuid::new_v4());
    store
        .insert_account_group_id(actor_id, &mut authorization_api, account_group_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create account id");

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(account_group_id))
}

#[utoipa::path(
    get,
    path = "/account_groups/{account_group_id}/permissions/add_owner",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to add the owner to"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor can add an owner"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn can_add_group_owner<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(account_group_id): Path<AccountGroupId>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(|error| {
                tracing::error!(?error, "Could not acquire access to the authorization API");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .can_add_group_owner(actor_id, account_group_id, Consistency::FullyConsistent)
            .await
            .map_err(|error| {
                tracing::error!(
                    ?error,
                    "Could not check if group owner could be added by the specified actor"
                );
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .has_permission,
    }))
}

#[utoipa::path(
    post,
    path = "/account_groups/{account_group_id}/owners/{account_id}",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to add the owner to"),
        ("account_id" = AccountId, Path, description = "The ID of the account to add to the group"),
    ),
    responses(
        (status = 201, description = "The account group owner was added"),

        (status = 403, description = "Permission denied"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn add_account_group_owner<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((account_group_id, account_id)): Path<(AccountGroupId, AccountId)>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<StatusCode, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .can_add_group_owner(actor_id, account_group_id, Consistency::FullyConsistent)
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if account group owner can be added"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    authorization_api
        .add_account_group_owner(account_id, account_group_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not add account group owner");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::CREATED)
}

#[utoipa::path(
    get,
    path = "/account_groups/{account_group_id}/permissions/remove_owner",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to remove the owner from"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor can remove an owner"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn can_remove_group_owner<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(account_group_id): Path<AccountGroupId>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(|error| {
                tracing::error!(?error, "Could not acquire access to the authorization API");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .can_remove_group_owner(actor_id, account_group_id, Consistency::FullyConsistent)
            .await
            .map_err(|error| {
                tracing::error!(
                    ?error,
                    "Could not check if group owner could be removed by the specified actor"
                );
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .has_permission,
    }))
}

#[utoipa::path(
    delete,
    path = "/account_groups/{account_group_id}/owners/{account_id}",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to remove the owner from"),
        ("account_id" = AccountId, Path, description = "The ID of the account to remove from the group")
    ),
    responses(
        (status = 204, description = "The account group owner was removed"),

        (status = 403, description = "Permission denied"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn remove_account_group_owner<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((account_group_id, account_id)): Path<(AccountGroupId, AccountId)>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<StatusCode, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .can_remove_group_owner(actor_id, account_group_id, Consistency::FullyConsistent)
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if account group owner can be removed"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    authorization_api
        .remove_account_group_owner(account_id, account_group_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not remove account group owner");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/account_groups/{account_group_id}/permissions/add_admin",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to add the admin to"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor can add an admin"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn can_add_group_admin<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(account_group_id): Path<AccountGroupId>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(|error| {
                tracing::error!(?error, "Could not acquire access to the authorization API");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .can_add_group_admin(actor_id, account_group_id, Consistency::FullyConsistent)
            .await
            .map_err(|error| {
                tracing::error!(
                    ?error,
                    "Could not check if group admin could be added by the specified actor"
                );
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .has_permission,
    }))
}

#[utoipa::path(
    post,
    path = "/account_groups/{account_group_id}/admins/{account_id}",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to add the admin to"),
        ("account_id" = AccountId, Path, description = "The ID of the account to add to the group"),
    ),
    responses(
        (status = 201, description = "The account group admin was added"),

        (status = 403, description = "Permission denied"),
        (status = 500, description = "Store error occurred"),
)
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn add_account_group_admin<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((account_group_id, account_id)): Path<(AccountGroupId, AccountId)>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<StatusCode, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .can_add_group_admin(actor_id, account_group_id, Consistency::FullyConsistent)
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if account group admin can be added"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    authorization_api
        .add_account_group_admin(account_id, account_group_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not add account group admin");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::CREATED)
}

#[utoipa::path(
    get,
    path = "/account_groups/{account_group_id}/permissions/remove_admin",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to remove the admin from"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor can remove an admin"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn can_remove_group_admin<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(account_group_id): Path<AccountGroupId>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(|error| {
                tracing::error!(?error, "Could not acquire access to the authorization API");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .can_remove_group_admin(actor_id, account_group_id, Consistency::FullyConsistent)
            .await
            .map_err(|error| {
                tracing::error!(
                    ?error,
                    "Could not check if group admin could be removed by the specified actor"
                );
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .has_permission,
    }))
}

#[utoipa::path(
    delete,
    path = "/account_groups/{account_group_id}/admins/{account_id}",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to remove the admin from"),
        ("account_id" = AccountId, Path, description = "The ID of the account to remove from the group")
    ),
    responses(
        (status = 204, description = "The account group admin was removed"),

        (status = 403, description = "Permission denied"),
        (status = 500, description = "Store error occurred"),
)
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn remove_account_group_admin<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((account_group_id, account_id)): Path<(AccountGroupId, AccountId)>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<StatusCode, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .can_remove_group_admin(actor_id, account_group_id, Consistency::FullyConsistent)
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if account group admin can be removed"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    authorization_api
        .remove_account_group_admin(account_id, account_group_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not remove account group admin");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/account_groups/{account_group_id}/permissions/add_member",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to add the member to"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor can add an member"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn can_add_group_member<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(account_group_id): Path<AccountGroupId>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(|error| {
                tracing::error!(?error, "Could not acquire access to the authorization API");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .can_add_group_member(actor_id, account_group_id, Consistency::FullyConsistent)
            .await
            .map_err(|error| {
                tracing::error!(
                    ?error,
                    "Could not check if group member could be added by the specified actor"
                );
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .has_permission,
    }))
}

#[utoipa::path(
    post,
    path = "/account_groups/{account_group_id}/members/{account_id}",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to add the member to"),
        ("account_id" = AccountId, Path, description = "The ID of the account to add to the group"),
    ),
    responses(
        (status = 201, description = "The account group member was added"),

        (status = 403, description = "Permission denied"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn add_account_group_member<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((account_group_id, account_id)): Path<(AccountGroupId, AccountId)>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<StatusCode, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .can_add_group_member(actor_id, account_group_id, Consistency::FullyConsistent)
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if account group member can be added"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    authorization_api
        .add_account_group_member(account_id, account_group_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not add account group member");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::CREATED)
}

#[utoipa::path(
    get,
    path = "/account_groups/{account_group_id}/permissions/remove_member",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to remove the member from"),
        ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor can remove an member"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn can_remove_group_member<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(account_group_id): Path<AccountGroupId>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(|error| {
                tracing::error!(?error, "Could not acquire access to the authorization API");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .can_remove_group_member(actor_id, account_group_id, Consistency::FullyConsistent)
            .await
            .map_err(|error| {
                tracing::error!(
                    ?error,
                    "Could not check if group member could be removed by the specified actor"
                );
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .has_permission,
    }))
}

#[utoipa::path(
    delete,
    path = "/account_groups/{account_group_id}/members/{account_id}",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to remove the member from"),
        ("account_id" = AccountId, Path, description = "The ID of the account to remove from the group")
    ),
    responses(
        (status = 204, description = "The account group member was removed"),

        (status = 403, description = "Permission denied"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn remove_account_group_member<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((account_group_id, account_id)): Path<(AccountGroupId, AccountId)>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<StatusCode, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .can_remove_group_member(actor_id, account_group_id, Consistency::FullyConsistent)
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if account group member can be removed"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    authorization_api
        .remove_account_group_member(account_id, account_group_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not remove account group member");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}
