//! Web routes for CRU operations on accounts.

use alloc::sync::Arc;

use authorization::{
    backend::ModifyRelationshipOperation,
    schema::{
        AccountGroupMemberSubject, AccountGroupPermission, AccountGroupRelationAndSubject,
        WebOwnerSubject,
    },
    zanzibar::Consistency,
    AuthorizationApi, AuthorizationApiPool,
};
use axum::{
    extract::Path,
    http::StatusCode,
    response::Response,
    routing::{get, post},
    Extension, Router,
};
use graph::store::{
    account::{InsertAccountGroupIdParams, InsertAccountIdParams},
    AccountStore, StorePool,
};
use graph_types::{
    account::{AccountGroupId, AccountId},
    owned_by_id::OwnedById,
};
use temporal_client::TemporalClient;
use utoipa::OpenApi;

use super::api_resource::RoutedResource;
use crate::rest::{
    json::Json, status::report_to_response, AuthenticatedUserHeader, PermissionResponse,
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_account,
        create_account_group,

        check_account_group_permission,
        add_account_group_member,
        remove_account_group_member,
    ),
    components(
        schemas(
            AccountId,
            AccountGroupId,
            AccountGroupPermission,

            InsertAccountIdParams,
            InsertAccountGroupIdParams,
        ),
    ),
    tags(
        (name = "Account", description = "Account management API")
    )
)]
pub(crate) struct AccountResource;

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
                                "/permissions/:permission",
                                get(check_account_group_permission::<A>),
                            )
                            .route(
                                "/members/:account_id",
                                post(add_account_group_member::<A>)
                                    .delete(remove_account_group_member::<A>),
                            ),
                    ),
            )
    }
}

#[utoipa::path(
    post,
    path = "/accounts",
    tag = "Account",
    request_body = InsertAccountIdParams,
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the created account", body = AccountId),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn create_account<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    Json(params): Json<InsertAccountIdParams>,
) -> Result<Json<AccountId>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let account_id = params.account_id;
    store
        .insert_account_id(actor_id, params)
        .await
        .map_err(report_to_response)?;

    Ok(Json(account_id))
}

#[utoipa::path(
    post,
    path = "/account_groups",
    tag = "Account Group",
    request_body = InsertAccountGroupIdParams,
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the created account", body = AccountGroupId),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn create_account_group<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    Json(params): Json<InsertAccountGroupIdParams>,
) -> Result<Json<AccountGroupId>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(|report| {
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
    if account != (WebOwnerSubject::Account { id: actor_id }) {
        tracing::error!("Account does not exist in the graph");
        return Err(StatusCode::NOT_FOUND);
    }

    let account_group_id = params.account_group_id;
    store
        .insert_account_group_id(actor_id, params)
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
    path = "/account_groups/{account_group_id}/permissions/{permission}",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("account_group_id" = AccountGroupId, Path, description = "The ID of the account group to check if the actor has the permission"),
        ("permission" = AccountGroupPermission, Path, description = "The permission to check for"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor can add an owner"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn check_account_group_permission<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((account_group_id, permission)): Path<(AccountGroupId, AccountGroupPermission)>,
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
            .check_account_group_permission(
                actor_id,
                permission,
                account_group_id,
                Consistency::FullyConsistent,
            )
            .await
            .map_err(|error| {
                tracing::error!(
                    ?error,
                    "Could not check if permission on the account group is granted to the \
                     specified actor"
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
        .check_account_group_permission(
            actor_id,
            AccountGroupPermission::AddMember,
            account_group_id,
            Consistency::FullyConsistent,
        )
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
        .modify_account_group_relations([(
            ModifyRelationshipOperation::Create,
            account_group_id,
            AccountGroupRelationAndSubject::Member {
                subject: AccountGroupMemberSubject::Account { id: account_id },
                level: 0,
            },
        )])
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not add account group member");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::CREATED)
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
        .check_account_group_permission(
            actor_id,
            AccountGroupPermission::RemoveMember,
            account_group_id,
            Consistency::FullyConsistent,
        )
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
        .modify_account_group_relations([(
            ModifyRelationshipOperation::Delete,
            account_group_id,
            AccountGroupRelationAndSubject::Member {
                subject: AccountGroupMemberSubject::Account { id: account_id },
                level: 0,
            },
        )])
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not remove account group member");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}
