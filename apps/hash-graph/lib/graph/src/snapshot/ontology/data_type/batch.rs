use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    snapshot::{ontology::table::DataTypeRow, WriteBatch},
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum DataTypeRowBatch {
    Schema(Vec<DataTypeRow>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for DataTypeRowBatch {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                r"
                    CREATE TEMPORARY TABLE data_types_tmp
                        (LIKE data_types INCLUDING ALL)
                        ON COMMIT DROP;
                ",
            )
            .await
            .into_report()
            .change_context(InsertionError)
            .attach_printable("could not create temporary tables")?;
        Ok(())
    }

    async fn write(&self, postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Schema(data_types) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO data_types_tmp
                            SELECT DISTINCT * FROM UNNEST($1::data_types[])
                            RETURNING 1;
                        ",
                        &[data_types],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} data type schemas", rows.len());
                }
            }
        }
        Ok(())
    }

    async fn commit(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                r"
                    INSERT INTO data_types SELECT * FROM data_types_tmp;
                ",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        Ok(())
    }
}
