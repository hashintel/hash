use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{AuthorizationApi, backend::ZanzibarBackend};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;

use super::table::{PolicyActionRow, PolicyEditionRow, PolicyRow};
use crate::{
    snapshot::WriteBatch,
    store::{AsClient, PostgresStore},
};

pub enum PolicyRowBatch {
    Id(Vec<PolicyRow>),
    Edition(Vec<PolicyEditionRow>),
    Action(Vec<PolicyActionRow>),
}

impl<C, A> WriteBatch<C, A> for PolicyRowBatch
where
    C: AsClient,
    A: AuthorizationApi + ZanzibarBackend + Send + Sync,
{
    async fn begin(
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    CREATE TEMPORARY TABLE policy_tmp
                        (LIKE policy INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE policy_edition_tmp
                        (LIKE policy_edition INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE policy_action_tmp
                        (LIKE policy_action INCLUDING ALL)
                        ON COMMIT DROP;
                ",
            )
            .await
            .change_context(InsertionError)
            .attach_printable("could not create temporary tables")?;
        Ok(())
    }

    async fn write(
        self,
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Id(policy) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO policy_tmp
                            SELECT DISTINCT * FROM UNNEST($1::policy[])
                            RETURNING 1;
                        ",
                        &[&policy],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} policy IDs", rows.len());
                }
            }
            Self::Edition(edition) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO policy_edition_tmp
                            SELECT DISTINCT * FROM UNNEST($1::policy_edition[])
                            RETURNING 1;
                        ",
                        &[&edition],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} policy editions", rows.len());
                }
            }
            Self::Action(action) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO policy_action_tmp
                            SELECT DISTINCT * FROM UNNEST($1::policy_action[])
                            RETURNING 1;
                        ",
                        &[&action],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} policy actions", rows.len());
                }
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
                    INSERT INTO policy
                        SELECT * FROM policy_tmp;

                    INSERT INTO policy_edition
                        SELECT * FROM policy_edition_tmp;

                    INSERT INTO policy_action
                        SELECT * FROM policy_action_tmp;
                ",
            )
            .await
            .change_context(InsertionError)?;

        Ok(())
    }
}
