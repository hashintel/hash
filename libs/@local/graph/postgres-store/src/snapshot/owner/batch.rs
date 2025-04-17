use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{backend::ZanzibarBackend, schema::AccountGroupRelationAndSubject};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;
use type_system::principal::actor_group::ActorGroupEntityUuid;

use crate::{
    snapshot::{
        WriteBatch,
        owner::{AccountGroupRow, AccountRow},
    },
    store::{AsClient, PostgresStore},
};

pub enum AccountRowBatch {
    Accounts(Vec<AccountRow>),
    AccountGroups(Vec<AccountGroupRow>),
    AccountGroupAccountRelations(Vec<(ActorGroupEntityUuid, AccountGroupRelationAndSubject)>),
}

impl<C, A> WriteBatch<C, A> for AccountRowBatch
where
    C: AsClient,
    A: ZanzibarBackend + Send + Sync,
{
    async fn begin(
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
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

    async fn write(
        self,
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
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
        _ignore_validation_errors: bool,
    ) -> Result<(), Report<InsertionError>> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    INSERT INTO accounts
                    SELECT * FROM accounts_tmp;

                    INSERT INTO account_groups
                    SELECT * FROM account_groups_tmp;
                ",
            )
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
