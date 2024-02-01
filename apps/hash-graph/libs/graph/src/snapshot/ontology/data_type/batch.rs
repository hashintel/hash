use std::collections::HashMap;

use async_trait::async_trait;
use authorization::{
    backend::ZanzibarBackend,
    schema::{DataTypeId, DataTypeRelationAndSubject},
};
use error_stack::{Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    snapshot::{ontology::table::DataTypeRow, WriteBatch},
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum DataTypeRowBatch {
    Schema(Vec<DataTypeRow>),
    Relations(HashMap<DataTypeId, Vec<DataTypeRelationAndSubject>>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for DataTypeRowBatch {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    CREATE TEMPORARY TABLE data_types_tmp
                        (LIKE data_types INCLUDING ALL)
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
        postgres_client: &PostgresStore<C>,
        authorization_api: &mut (impl ZanzibarBackend + Send),
    ) -> Result<(), InsertionError> {
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
            #[expect(
                clippy::needless_collect,
                reason = "Lifetime error, probably the signatures are wrong"
            )]
            Self::Relations(relations) => {
                authorization_api
                    .touch_relationships(
                        relations
                            .into_iter()
                            .flat_map(|(id, relations)| {
                                relations.into_iter().map(move |relation| (id, relation))
                            })
                            .collect::<Vec<_>>(),
                    )
                    .await
                    .change_context(InsertionError)?;
            }
        }
        Ok(())
    }

    async fn commit(
        postgres_client: &PostgresStore<C>,
        _validation: bool,
    ) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    INSERT INTO data_types SELECT * FROM data_types_tmp;
                ",
            )
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
