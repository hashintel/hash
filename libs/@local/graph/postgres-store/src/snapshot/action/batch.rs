use error_stack::{Report, ResultExt as _};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;

use super::table::{ActionHierarchyRow, ActionRow};
use crate::{
    snapshot::WriteBatch,
    store::{AsClient, PostgresStore},
};

pub enum ActionRowBatch {
    Name(Vec<ActionRow>),
    Hierarchy(Vec<ActionHierarchyRow>),
}

impl<C> WriteBatch<C> for ActionRowBatch
where
    C: AsClient,
{
    async fn begin(postgres_client: &mut PostgresStore<C>) -> Result<(), Report<InsertionError>> {
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
            .instrument(tracing::info_span!(
                "CREATE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)
            .attach_printable("could not create temporary tables")?;
        Ok(())
    }

    async fn write(
        self,
        postgres_client: &mut PostgresStore<C>,
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
        postgres_client: &mut PostgresStore<C>,
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
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)?;

        postgres_client
            .synchronize_action_hierarchies()
            .await
            .change_context(InsertionError)?;

        Ok(())
    }
}
