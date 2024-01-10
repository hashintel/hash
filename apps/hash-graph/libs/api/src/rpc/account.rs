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
use error_stack::{Report, Result, ResultExt};
use graph::store::{AccountStore, StorePool};
use graph_types::{
    account::{AccountGroupId, AccountId},
    provenance::OwnedById,
};
use hash_graph_rpc::{
    harpc::{Context, RequestMeta},
    specification::account::{
        AccountService, AddAccountGroupMember, CheckAccountGroupPermission, CreateAccount,
        CreateAccountGroup, RemoveAccountGroupMember,
    },
    Service, ServiceBuilder,
};
use uuid::Uuid;

use crate::rpc::State;

// TODO: associate error codes?!
#[derive(Debug, Copy, Clone)]
struct AccountServiceError;

impl Display for AccountServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("account service error")
    }
}

impl error_stack::Context for AccountServiceError {}

async fn create_account<S, A>(
    _: CreateAccount,
    meta: RequestMeta,
    state: &State<S, A>,
) -> Result<AccountId, AccountServiceError>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let actor_id = AccountId::new(meta.actor.into());

    let mut store = state
        .store_pool
        .acquire()
        .await
        .change_context(AccountServiceError)?;

    let mut authorization_api = state
        .authorization_api_pool
        .acquire()
        .await
        .change_context(AccountServiceError)?;

    let account_id = AccountId::new(Uuid::new_v4());
    store
        .insert_account_id(actor_id, &mut authorization_api, account_id)
        .await
        .change_context(AccountServiceError)?;

    Ok(account_id)
}

async fn create_account_group<S, A>(
    _: CreateAccountGroup,
    meta: RequestMeta,
    state: &State<S, A>,
) -> Result<AccountGroupId, AccountServiceError>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let actor_id = AccountId::new(meta.actor.into());

    let mut store = state
        .store_pool
        .acquire()
        .await
        .change_context(AccountServiceError)?;

    let account = store
        .identify_owned_by_id(OwnedById::from(actor_id))
        .await
        .change_context(AccountServiceError)?;

    if account != (WebOwnerSubject::Account { id: actor_id }) {
        // TODO: proper context!
        return Err(Report::new(AccountServiceError));
    }

    let mut authorization_api = state
        .authorization_api_pool
        .acquire()
        .await
        .change_context(AccountServiceError)?;

    let account_group_id = AccountGroupId::new(Uuid::new_v4());
    store
        .insert_account_group_id(actor_id, &mut authorization_api, account_group_id)
        .await
        .change_context(AccountServiceError)?;

    Ok(account_group_id)
}

async fn check_account_group_permission<S, A>(
    CheckAccountGroupPermission {
        account_group_id,
        permission,
    }: CheckAccountGroupPermission,
    meta: RequestMeta,
    state: &State<S, A>,
) -> Result<bool, AccountServiceError>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let actor_id = AccountId::new(meta.actor.into());

    let authorization_api = state
        .authorization_api_pool
        .acquire()
        .await
        .change_context(AccountServiceError)?;

    let response = authorization_api
        .check_account_group_permission(
            actor_id,
            permission,
            account_group_id,
            Consistency::FullyConsistent,
        )
        .await
        .change_context(AccountServiceError)?;

    Ok(response.has_permission)
}

async fn add_account_group_member<S, A>(
    AddAccountGroupMember {
        account_group_id,
        account_id,
    }: AddAccountGroupMember,
    meta: RequestMeta,
    state: &State<S, A>,
) -> Result<(), AccountServiceError>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let actor_id = AccountId::new(meta.actor.into());

    let mut authorization_api = state
        .authorization_api_pool
        .acquire()
        .await
        .change_context(AccountServiceError)?;

    let has_permission = authorization_api
        .check_account_group_permission(
            actor_id,
            AccountGroupPermission::AddMember,
            account_group_id,
            Consistency::FullyConsistent,
        )
        .await
        .change_context(AccountServiceError)?
        .has_permission;

    if !has_permission {
        // TODO: proper context!
        return Err(Report::new(AccountServiceError));
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
        .change_context(AccountServiceError)?;

    Ok(())
}

async fn remove_account_group_member<S, A>(
    RemoveAccountGroupMember {
        account_group_id,
        account_id,
    }: RemoveAccountGroupMember,
    meta: RequestMeta,
    state: &State<S, A>,
) -> Result<(), AccountServiceError>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let actor_id = AccountId::new(meta.actor.into());

    let mut authorization_api = state
        .authorization_api_pool
        .acquire()
        .await
        .change_context(AccountServiceError)?;

    let has_permission = authorization_api
        .check_account_group_permission(
            actor_id,
            AccountGroupPermission::RemoveMember,
            account_group_id,
            Consistency::FullyConsistent,
        )
        .await
        .change_context(AccountServiceError)?
        .has_permission;

    if !has_permission {
        // TODO: proper context!
        return Err(Report::new(AccountServiceError));
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
        .change_context(AccountServiceError)?;

    Ok(())
}

pub(crate) fn service<C, S, A>() -> Service<AccountService, C>
where
    C: Context<State = State<S, A>>,
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    ServiceBuilder::new()
        .add_procedure(create_account::<S, A>)
        .add_procedure(create_account_group::<S, A>)
        .add_procedure(check_account_group_permission::<S, A>)
        .add_procedure(add_account_group_member::<S, A>)
        .add_procedure(remove_account_group_member::<S, A>)
        .build()
}
