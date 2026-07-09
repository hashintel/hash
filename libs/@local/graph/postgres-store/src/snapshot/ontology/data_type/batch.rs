use error_stack::{Report, ResultExt as _};
use hash_graph_store::{data_type::DataTypeStore as _, error::InsertionError};
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;

use crate::{
    snapshot::{SnapshotInsertOptions, WriteBatch, insert_rows_batch},
    store::{
        AsClient, PostgresStore,
        postgres::query::{
            OnConflict,
            rows::{DataTypeConversionsRow, DataTypeEmbeddingRow, DataTypeRow},
        },
    },
};

pub enum DataTypeRowBatch {
    Schema(Vec<DataTypeRow>),
    Conversions(Vec<DataTypeConversionsRow>),
    Embeddings(Vec<DataTypeEmbeddingRow<'static>>),
}

impl<C> WriteBatch<C> for DataTypeRowBatch
where
    C: AsClient,
{
    async fn begin(postgres_client: &mut PostgresStore<C>) -> Result<(), Report<InsertionError>> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    CREATE TEMPORARY TABLE data_types_tmp
                        (LIKE data_types INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE data_type_conversions_tmp
                        (LIKE data_type_conversions INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE data_type_embeddings_tmp
                        (LIKE data_type_embeddings INCLUDING ALL)
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
        postgres_client: &mut PostgresStore<C>,
    ) -> Result<(), Report<InsertionError>> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Schema(data_types) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &data_types,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} data type schemas");
                }
            }
            Self::Conversions(conversions) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &conversions,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} data type schemas");
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
                    tracing::info!("Read {inserted_rows} data type embeddings");
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
                    INSERT INTO data_types
                        SELECT * FROM data_types_tmp;

                    INSERT INTO data_type_conversions
                        SELECT * FROM data_type_conversions_tmp;

                    INSERT INTO data_type_embeddings
                        SELECT * FROM data_type_embeddings_tmp;
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
            .reindex_data_type_cache()
            .await
            .change_context(InsertionError)?;

        Ok(())
    }
}
