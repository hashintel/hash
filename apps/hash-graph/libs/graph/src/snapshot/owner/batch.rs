use async_trait::async_trait;
use authorization::{backend::ZanzibarBackend, schema::AccountGroupRelationAndSubject};
use error_stack::{Result, ResultExt};
use graph_types::account::AccountGroupId;
use tokio_postgres::GenericClient;

use crate::{
    snapshot::{
        WriteBatch,
        owner::{AccountGroupRow, AccountRow},
    },
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum AccountRowBatch {
    Accounts(Vec<AccountRow>),
    AccountGroups(Vec<AccountGroupRow>),
    AccountGroupAccountRelations(Vec<(AccountGroupId, AccountGroupRelationAndSubject)>),
}

#[async_trait]
impl<C, A> WriteBatch<C, A> for AccountRowBatch
where
    C: AsClient,
    A: ZanzibarBackend + Send + Sync,
{
    async fn begin(postgres_client: &mut PostgresStore<C, A>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    CREATE TEMPORARY TABLE accounts_tmp (
                        LIKE accounts INCLUDING ALL
                    ) ON COMMIT DROP;
                    CREATE TEMPORARY TABLE account_groups_tmp (
                        LIKE account_groups INCLUDING ALL
                    ) ON COMMIT DROP;
                ",
            )
            .await
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn write(self, postgres_client: &mut PostgresStore<C, A>) -> Result<(), InsertionError> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Accounts(accounts) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO accounts_tmp
                            SELECT DISTINCT * FROM UNNEST($1::accounts[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&accounts],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} accounts", rows.len());
                }
            }
            Self::AccountGroups(account_groups) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO account_groups_tmp
                            SELECT DISTINCT * FROM UNNEST($1::account_groups[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&account_groups],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} account groups", rows.len());
                }
            }
            Self::AccountGroupAccountRelations(relations) => {
                postgres_client
                    .authorization_api
                    .touch_relationships(relations)
                    .await
                    .change_context(InsertionError)?;
            }
        }
        Ok(())
    }

    async fn commit(
        postgres_client: &mut PostgresStore<C, A>,
        _validation: bool,
    ) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    INSERT INTO accounts
                    SELECT * FROM accounts_tmp
                    ON CONFLICT DO NOTHING;

                    INSERT INTO account_groups
                    SELECT * FROM account_groups_tmp
                    ON CONFLICT DO NOTHING;
                ",
            )
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
