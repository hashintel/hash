use std::fmt::Display;

use authorization::{
    backend::ModifyRelationshipOperation,
    schema::{
        AccountGroupMemberSubject, AccountGroupPermission, AccountGroupRelationAndSubject,
        WebOwnerSubject,
    },
    zanzibar::Consistency,
    AuthorizationApi, AuthorizationApiPool,
};
use error_stack::{Report, ResultExt};
use graph::store::{AccountStore, StorePool};
use graph_types::{
    account::{AccountGroupId, AccountId},
    provenance::OwnedById,
};
use hash_graph_rpc::{
    harpc::RequestMeta,
    specification::{
        account::{
            AccountService, AddAccountGroupMember, CheckAccountGroupPermission, CreateAccount,
            CreateAccountGroup, RemoveAccountGroupMember,
        },
        common::{Error, JsonCodec, JsonContext},
    },
    Service, ServiceBuilder,
};
use hash_status::StatusCode;
use uuid::Uuid;

use crate::rpc::State;

#[derive(Debug, Copy, Clone)]
struct AccountDoesNotExistError;

impl Display for AccountDoesNotExistError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("account does not exist")
    }
}

impl std::error::Error for AccountDoesNotExistError {}

#[derive(Debug, Copy, Clone)]
struct MissingPermissionError;

impl Display for MissingPermissionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("missing privilege")
    }
}

impl std::error::Error for MissingPermissionError {}

async fn create_account<S, A>(
    _request: CreateAccount,
    meta: RequestMeta,
    state: State<S, A>,
) -> Result<AccountId, Error>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let actor_id = AccountId::new(meta.actor.into());

    let mut store = state
        .store_pool
        .acquire()
        .await
        .attach(StatusCode::InvalidArgument)?;

    let mut authorization_api = state
        .authorization_api_pool
        .acquire()
        .await
        .attach(StatusCode::Internal)?;

    let account_id = AccountId::new(Uuid::new_v4());
    store
        .insert_account_id(actor_id, &mut authorization_api, account_id)
        .await
        .attach(StatusCode::Internal)?;

    Ok(account_id)
}

async fn create_account_group<S, A>(
    _request: CreateAccountGroup,
    meta: RequestMeta,
    state: State<S, A>,
) -> Result<AccountGroupId, Error>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let actor_id = AccountId::new(meta.actor.into());

    let mut store = state
        .store_pool
        .acquire()
        .await
        .attach(StatusCode::Internal)?;

    let account = store
        .identify_owned_by_id(OwnedById::from(actor_id))
        .await
        .attach(StatusCode::Internal)?;

    if account != (WebOwnerSubject::Account { id: actor_id }) {
        return Err(Report::new(AccountDoesNotExistError)
            .attach(StatusCode::NotFound)
            .into());
    }

    let mut authorization_api = state
        .authorization_api_pool
        .acquire()
        .await
        .attach(StatusCode::Internal)?;

    let account_group_id = AccountGroupId::new(Uuid::new_v4());
    store
        .insert_account_group_id(actor_id, &mut authorization_api, account_group_id)
        .await
        .attach(StatusCode::Internal)?;

    Ok(account_group_id)
}

async fn check_account_group_permission<S, A>(
    CheckAccountGroupPermission {
        account_group_id,
        permission,
    }: CheckAccountGroupPermission,
    meta: RequestMeta,
    state: State<S, A>,
) -> Result<bool, Error>
where
    S: Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let actor_id = AccountId::new(meta.actor.into());

    let authorization_api = state
        .authorization_api_pool
        .acquire()
        .await
        .attach(StatusCode::Internal)?;

    let response = authorization_api
        .check_account_group_permission(
            actor_id,
            permission,
            account_group_id,
            Consistency::FullyConsistent,
        )
        .await
        .attach(StatusCode::Internal)?;

    Ok(response.has_permission)
}

async fn add_account_group_member<S, A>(
    AddAccountGroupMember {
        account_group_id,
        account_id,
    }: AddAccountGroupMember,
    meta: RequestMeta,
    state: State<S, A>,
) -> Result<(), Error>
where
    S: Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let actor_id = AccountId::new(meta.actor.into());

    let mut authorization_api = state
        .authorization_api_pool
        .acquire()
        .await
        .attach(StatusCode::Internal)?;

    let has_permission = authorization_api
        .check_account_group_permission(
            actor_id,
            AccountGroupPermission::AddMember,
            account_group_id,
            Consistency::FullyConsistent,
        )
        .await
        .attach(StatusCode::Internal)?
        .has_permission;

    if !has_permission {
        return Err(Report::new(MissingPermissionError)
            .attach(StatusCode::PermissionDenied)
            .into());
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
        .attach(StatusCode::Internal)?;

    Ok(())
}

async fn remove_account_group_member<S, A>(
    RemoveAccountGroupMember {
        account_group_id,
        account_id,
    }: RemoveAccountGroupMember,
    meta: RequestMeta,
    state: State<S, A>,
) -> Result<(), Error>
where
    S: Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let actor_id = AccountId::new(meta.actor.into());

    let mut authorization_api = state
        .authorization_api_pool
        .acquire()
        .await
        .attach(StatusCode::Internal)?;

    let has_permission = authorization_api
        .check_account_group_permission(
            actor_id,
            AccountGroupPermission::RemoveMember,
            account_group_id,
            Consistency::FullyConsistent,
        )
        .await
        .attach(StatusCode::Internal)?
        .has_permission;

    if !has_permission {
        return Err(Report::new(MissingPermissionError)
            .attach(StatusCode::PermissionDenied)
            .into());
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
        .attach(StatusCode::Internal)?;

    Ok(())
}

pub(crate) fn service<S, A>() -> Service<AccountService, JsonContext<State<S, A>>>
where
    S: StorePool + Send + Sync + 'static,
    A: AuthorizationApiPool + Send + Sync + 'static,
{
    ServiceBuilder::new()
        .add_procedure(create_account::<S, A>)
        .add_procedure(create_account_group::<S, A>)
        .add_procedure(check_account_group_permission::<S, A>)
        .add_procedure(add_account_group_member::<S, A>)
        .add_procedure(remove_account_group_member::<S, A>)
        .build()
}
