use error_stack::{Report, ResultExt as _};
use hash_graph_store::{entity_type::EntityTypeStore as _, error::InsertionError};
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;

use crate::{
    snapshot::{SnapshotInsertOptions, WriteBatch, insert_rows_batch},
    store::{
        AsClient, PostgresStore,
        postgres::query::{
            OnConflict,
            rows::{EntityTypeEmbeddingRow, EntityTypeRow},
        },
    },
};

pub enum EntityTypeRowBatch {
    Schema(Vec<EntityTypeRow>),
    Embeddings(Vec<EntityTypeEmbeddingRow<'static>>),
}

impl<C> WriteBatch<C> for EntityTypeRowBatch
where
    C: AsClient,
{
    async fn begin(postgres_client: &mut PostgresStore<C>) -> Result<(), Report<InsertionError>> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    CREATE TEMPORARY TABLE entity_types_tmp (
                        LIKE entity_types INCLUDING ALL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_type_embeddings_tmp (
                        LIKE entity_type_embeddings INCLUDING ALL
                    ) ON COMMIT DROP;
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
        postgres_client: &mut PostgresStore<C>,
    ) -> Result<(), Report<InsertionError>> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Schema(entity_types) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &entity_types,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} entity type schemas");
                }
            }
            Self::Embeddings(embeddings) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &embeddings,
                    SnapshotInsertOptions {
                        distinct: false,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} entity type embeddings");
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
                    INSERT INTO entity_types
                        SELECT * FROM entity_types_tmp;

                    INSERT INTO entity_type_embeddings
                        SELECT * FROM entity_type_embeddings_tmp;
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
            .reindex_entity_type_cache()
            .await
            .change_context(InsertionError)?;

        Ok(())
    }
}
