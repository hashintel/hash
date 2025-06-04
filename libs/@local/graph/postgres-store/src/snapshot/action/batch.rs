use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{AuthorizationApi, backend::ZanzibarBackend};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;

use super::table::{ActionHierarchyRow, ActionRow};
use crate::{
    snapshot::WriteBatch,
    store::{AsClient, PostgresStore},
};

pub enum ActionRowBatch {
    Name(Vec<ActionRow>),
    Hierarchy(Vec<ActionHierarchyRow>),
}

impl<C, A> WriteBatch<C, A> for ActionRowBatch
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
                    CREATE TEMPORARY TABLE action_tmp
                        (LIKE action INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE action_hierarchy_tmp
                        (LIKE action_hierarchy INCLUDING ALL)
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
            Self::Name(actions) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO action_tmp
                            SELECT DISTINCT * FROM UNNEST($1::action[])
                            RETURNING 1;
                        ",
                        &[&actions],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} actions", rows.len());
                }
            }
            Self::Hierarchy(hierarchy) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO action_hierarchy_tmp
                            SELECT DISTINCT * FROM UNNEST($1::action_hierarchy[])
                            RETURNING 1;
                        ",
                        &[&hierarchy],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} action hierarchies", rows.len());
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
                    INSERT INTO action
                        SELECT * FROM action_tmp;

                    INSERT INTO action_hierarchy
                        SELECT * FROM action_hierarchy_tmp;
                ",
            )
            .await
            .change_context(InsertionError)?;

        postgres_client
            .synchronize_action_hierarchies()
            .await
            .change_context(InsertionError)?;

        Ok(())
    }
}
