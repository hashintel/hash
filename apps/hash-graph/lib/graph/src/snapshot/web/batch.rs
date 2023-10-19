use async_trait::async_trait;
use authorization::{
    backend::ZanzibarBackend,
    schema::{AccountGroupPermission, WebRelation},
};
use error_stack::{Result, ResultExt};
use graph_types::{
    account::{AccountGroupId, AccountId},
    web::WebId,
};

use crate::{
    snapshot::WriteBatch,
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum WebBatch {
    Accounts(Vec<(WebId, WebRelation, AccountId)>),
    AccountGroups(Vec<(WebId, WebRelation, (AccountGroupId, AccountGroupPermission))>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for WebBatch {
    async fn begin(_postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        Ok(())
    }

    async fn write(
        self,
        _postgres_client: &PostgresStore<C>,
        authorization_api: &mut (impl ZanzibarBackend + Send),
    ) -> Result<(), InsertionError> {
        match self {
            Self::Accounts(accounts) => {
                authorization_api
                    .touch_relationships(accounts)
                    .await
                    .change_context(InsertionError)?;
            }
            Self::AccountGroups(account_groups) => {
                authorization_api
                    .touch_relationships(account_groups)
                    .await
                    .change_context(InsertionError)?;
            }
        }
        Ok(())
    }

    async fn commit(_postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        Ok(())
    }
}
