use std::collections::HashMap;

use async_trait::async_trait;
use authorization::{
    AuthorizationApi, backend::ZanzibarBackend, schema::DataTypeRelationAndSubject,
};
use error_stack::{Result, ResultExt};
use graph_types::ontology::DataTypeId;
use tokio_postgres::GenericClient;

use crate::{
    snapshot::WriteBatch,
    store::{
        AsClient, DataTypeStore, InsertionError, PostgresStore,
        postgres::query::rows::{DataTypeConversionsRow, DataTypeEmbeddingRow, DataTypeRow},
    },
};

pub enum DataTypeRowBatch {
    Schema(Vec<DataTypeRow>),
    Conversions(Vec<DataTypeConversionsRow>),
    Relations(HashMap<DataTypeId, Vec<DataTypeRelationAndSubject>>),
    Embeddings(Vec<DataTypeEmbeddingRow<'static>>),
}

#[async_trait]
impl<C, A> WriteBatch<C, A> for DataTypeRowBatch
where
    C: AsClient,
    A: AuthorizationApi + ZanzibarBackend + Send + Sync,
{
    async fn begin(postgres_client: &mut PostgresStore<C, A>) -> Result<(), InsertionError> {
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

    async fn write(self, postgres_client: &mut PostgresStore<C, A>) -> Result<(), InsertionError> {
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
            #[expect(
                clippy::needless_collect,
                reason = "Lifetime error, probably the signatures are wrong"
            )]
            Self::Relations(relations) => {
                postgres_client
                    .authorization_api
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
        postgres_client: &mut PostgresStore<C, A>,
        _validation: bool,
    ) -> Result<(), InsertionError> {
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

        <PostgresStore<C, A> as DataTypeStore>::reindex_cache(postgres_client)
            .await
            .change_context(InsertionError)?;

        Ok(())
    }
}
