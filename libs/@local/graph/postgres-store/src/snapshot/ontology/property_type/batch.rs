use error_stack::{Report, ResultExt as _};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;

use crate::{
    snapshot::{SnapshotInsertOptions, WriteBatch, insert_rows_batch},
    store::{
        AsClient, InTransaction, PostgresStore,
        postgres::query::{
            OnConflict,
            rows::{
                PropertyTypeConstrainsPropertiesOnRow, PropertyTypeConstrainsValuesOnRow,
                PropertyTypeEmbeddingRow, PropertyTypeRow,
            },
        },
    },
};

pub enum PropertyTypeRowBatch {
    Schema(Vec<PropertyTypeRow>),
    ConstrainsValues(Vec<PropertyTypeConstrainsValuesOnRow>),
    ConstrainsProperties(Vec<PropertyTypeConstrainsPropertiesOnRow>),
    Embeddings(Vec<PropertyTypeEmbeddingRow<'static>>),
}

impl<C> WriteBatch<C> for PropertyTypeRowBatch
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
                    CREATE TEMPORARY TABLE property_types_tmp (
                        LIKE property_types INCLUDING ALL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE property_type_constrains_values_on_tmp (
                        LIKE property_type_constrains_values_on INCLUDING ALL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE property_type_constrains_properties_on_tmp (
                        LIKE property_type_constrains_properties_on INCLUDING ALL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE property_type_embeddings_tmp (
                        LIKE property_type_embeddings INCLUDING ALL
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
        postgres_client: &mut PostgresStore<C, InTransaction>,
    ) -> Result<(), Report<InsertionError>> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Schema(property_types) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &property_types,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} property type schemas");
                }
            }
            Self::ConstrainsValues(values) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &values,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} property type value constrains");
                }
            }
            Self::ConstrainsProperties(properties) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &properties,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} property type property type constrains");
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
                    tracing::info!("Read {inserted_rows} property type embeddings");
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
                    INSERT INTO property_types
                        SELECT * FROM property_types_tmp;

                    INSERT INTO property_type_constrains_values_on
                        SELECT * FROM property_type_constrains_values_on_tmp;

                    INSERT INTO property_type_constrains_properties_on
                        SELECT * FROM property_type_constrains_properties_on_tmp;

                    INSERT INTO property_type_embeddings
                        SELECT * FROM property_type_embeddings_tmp;
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
