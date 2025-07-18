use error_stack::{Report, ResultExt as _};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;

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

impl<C> WriteBatch<C> for PolicyRowBatch
where
    C: AsClient,
{
    async fn begin(postgres_client: &mut PostgresStore<C>) -> Result<(), Report<InsertionError>> {
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
        postgres_client: &mut PostgresStore<C>,
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
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)?;

        Ok(())
    }
}
