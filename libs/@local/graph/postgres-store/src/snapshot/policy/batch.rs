use error_stack::{Report, ResultExt as _};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;

use super::table::{PolicyActionRow, PolicyEditionRow, PolicyRow};
use crate::{
    snapshot::{SnapshotInsertOptions, WriteBatch, insert_rows_batch},
    store::{AsClient, InTransaction, PostgresStore, postgres::query::OnConflict},
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
    async fn begin(
        postgres_client: &mut PostgresStore<C, InTransaction>,
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
            .instrument(tracing::info_span!(
                "CREATE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)
            .attach("could not create temporary tables")?;
        Ok(())
    }

    async fn write(
        self,
        postgres_client: &mut PostgresStore<C, InTransaction>,
    ) -> Result<(), Report<InsertionError>> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Id(policy) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &policy,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::DoNothing,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} policy IDs");
                }
            }
            Self::Edition(edition) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &edition,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} policy editions");
                }
            }
            Self::Action(action) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &action,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} policy actions");
                }
            }
        }
        Ok(())
    }

    async fn commit(
        postgres_client: &mut PostgresStore<C, InTransaction>,
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
