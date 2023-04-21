use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    snapshot::{account::AccountRow, WriteBatch},
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum AccountRowBatch {
    Accounts(Vec<AccountRow>),
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
                ",
            )
            .await
            .into_report()
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
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} accounts", rows.len());
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
                    INSERT INTO accounts SELECT * FROM accounts_tmp;
                ",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        Ok(())
    }
}
