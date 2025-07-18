use error_stack::{Report, ResultExt as _};
use hash_graph_store::{data_type::DataTypeStore as _, error::InsertionError};
use tokio_postgres::GenericClient as _;

use crate::{
    snapshot::WriteBatch,
    store::{
        AsClient, PostgresStore,
        postgres::query::rows::{DataTypeConversionsRow, DataTypeEmbeddingRow, DataTypeRow},
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
            Self::Schema(data_types) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO data_types_tmp
                            SELECT DISTINCT * FROM UNNEST($1::data_types[])
                            RETURNING 1;
                        ",
                        &[&data_types],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} data type schemas", rows.len());
                }
            }
            Self::Conversions(conversions) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO data_type_conversions_tmp
                            SELECT DISTINCT * FROM UNNEST($1::data_type_conversions[])
                            RETURNING 1;
                        ",
                        &[&conversions],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} data type schemas", rows.len());
                }
            }
            Self::Embeddings(embeddings) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO data_type_embeddings_tmp
                            SELECT * FROM UNNEST($1::data_type_embeddings[])
                            RETURNING 1;
                        ",
                        &[&embeddings],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} data type embeddings", rows.len());
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
            .await
            .change_context(InsertionError)?;

        postgres_client
            .reindex_data_type_cache()
            .await
            .change_context(InsertionError)?;

        Ok(())
    }
}
