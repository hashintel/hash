use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{backend::ZanzibarBackend, schema::PropertyTypeRelationAndSubject};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;
use type_system::schema::PropertyTypeUuid;

use crate::{
    snapshot::WriteBatch,
    store::{
        AsClient, PostgresStore,
        postgres::query::rows::{
            PropertyTypeConstrainsPropertiesOnRow, PropertyTypeConstrainsValuesOnRow,
            PropertyTypeEmbeddingRow, PropertyTypeRow,
        },
    },
};

pub enum PropertyTypeRowBatch {
    Schema(Vec<PropertyTypeRow>),
    ConstrainsValues(Vec<PropertyTypeConstrainsValuesOnRow>),
    ConstrainsProperties(Vec<PropertyTypeConstrainsPropertiesOnRow>),
    Relations(HashMap<PropertyTypeUuid, Vec<PropertyTypeRelationAndSubject>>),
    Embeddings(Vec<PropertyTypeEmbeddingRow<'static>>),
}

impl<C, A> WriteBatch<C, A> for PropertyTypeRowBatch
where
    C: AsClient,
    A: ZanzibarBackend + Send + Sync,
{
    async fn begin(
        postgres_client: &mut PostgresStore<C, A>,
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
            .await
            .change_context(InsertionError)
            .attach_printable("could not create temporary tables")?;
        Ok(())
    }

    async fn write(
        self,
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Schema(property_types) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO property_types_tmp
                            SELECT DISTINCT * FROM UNNEST($1::property_types[])
                            RETURNING 1;
                        ",
                        &[&property_types],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} property type schemas", rows.len());
                }
            }
            Self::ConstrainsValues(values) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO property_type_constrains_values_on_tmp
                            SELECT DISTINCT *
                              FROM UNNEST($1::property_type_constrains_values_on[])
                            RETURNING 1;
                        ",
                        &[&values],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} property type value constrains", rows.len());
                }
            }
            Self::ConstrainsProperties(properties) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO property_type_constrains_properties_on_tmp
                            SELECT DISTINCT * FROM \
                         UNNEST($1::property_type_constrains_properties_on[])
                            RETURNING 1;
                        ",
                        &[&properties],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} property type property type constrains", rows.len());
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
                            INSERT INTO property_type_embeddings_tmp
                            SELECT * FROM UNNEST($1::property_type_embeddings[])
                            RETURNING 1;
                        ",
                        &[&embeddings],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} property type embeddings", rows.len());
                }
            }
        }
        Ok(())
    }

    async fn commit(
        postgres_client: &mut PostgresStore<C, A>,
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
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
