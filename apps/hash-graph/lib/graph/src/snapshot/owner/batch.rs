use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    snapshot::{
        owner::{AccountGroupRow, AccountRow},
        WriteBatch,
    },
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum AccountRowBatch {
    Accounts(Vec<AccountRow>),
    AccountGroups(Vec<AccountGroupRow>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for AccountRowBatch {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                r"
                    CREATE TEMPORARY TABLE accounts_tmp
                        (LIKE accounts INCLUDING ALL)
                        ON COMMIT DROP;
                    CREATE TEMPORARY TABLE account_groups_tmp
                        (LIKE account_groups INCLUDING ALL)
                        ON COMMIT DROP;
                ",
            )
            .await
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn write(&self, postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Accounts(accounts) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO accounts_tmp
                            SELECT DISTINCT * FROM UNNEST($1::accounts[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[accounts],
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
                        r"
                            INSERT INTO account_groups_tmp
                            SELECT DISTINCT * FROM UNNEST($1::account_groups[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[account_groups],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} account groups", rows.len());
                }
            }
        }
        Ok(())
    }

    async fn commit(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                r"
                    WITH inserted_accounts AS (
                        INSERT INTO accounts
                        SELECT * FROM accounts_tmp
                        ON CONFLICT DO NOTHING
                        RETURNING account_id
                    )
                    INSERT INTO owners
                    SELECT account_id as owner_id
                    FROM inserted_accounts;

                    WITH inserted_account_groups AS (
                        INSERT INTO account_groups
                        SELECT * FROM account_groups_tmp
                        ON CONFLICT DO NOTHING
                        RETURNING account_group_id
                    )
                    INSERT INTO owners
                    SELECT account_group_id as owner_id
                    FROM inserted_account_groups;
                ",
            )
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
