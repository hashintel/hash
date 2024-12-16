use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{
    AuthorizationApi, backend::ZanzibarBackend, schema::EntityTypeRelationAndSubject,
};
use hash_graph_store::{entity_type::EntityTypeStore as _, error::InsertionError};
use tokio_postgres::GenericClient as _;
use type_system::schema::EntityTypeUuid;

use crate::{
    snapshot::WriteBatch,
    store::{
        AsClient, PostgresStore,
        postgres::query::rows::{EntityTypeEmbeddingRow, EntityTypeRow},
    },
};

pub enum EntityTypeRowBatch {
    Schema(Vec<EntityTypeRow>),
    Relations(HashMap<EntityTypeUuid, Vec<EntityTypeRelationAndSubject>>),
    Embeddings(Vec<EntityTypeEmbeddingRow<'static>>),
}

impl<C, A> WriteBatch<C, A> for EntityTypeRowBatch
where
    C: AsClient,
    A: ZanzibarBackend + AuthorizationApi,
{
    async fn begin(
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
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
            Self::Schema(entity_types) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_types_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_types[])
                            RETURNING 1;
                        ",
                        &[&entity_types],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity type schemas", rows.len());
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
                            INSERT INTO entity_type_embeddings_tmp
                            SELECT * FROM UNNEST($1::entity_type_embeddings[])
                            RETURNING 1;
                        ",
                        &[&embeddings],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity type embeddings", rows.len());
                }
            }
        }
        Ok(())
    }

    async fn commit(
        postgres_client: &mut PostgresStore<C, A>,
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
            .await
            .change_context(InsertionError)?;

        postgres_client
            .reindex_entity_type_cache()
            .await
            .change_context(InsertionError)?;

        Ok(())
    }
}
