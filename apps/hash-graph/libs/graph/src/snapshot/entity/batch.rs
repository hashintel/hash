use std::collections::HashMap;

use async_trait::async_trait;
use authorization::{backend::ZanzibarBackend, schema::EntityRelationAndSubject, AuthorizationApi};
use error_stack::{Report, ResultExt};
use futures::TryStreamExt;
use graph_types::{
    knowledge::entity::{Entity, EntityUuid},
    ontology::EntityTypeId,
};
use tokio_postgres::GenericClient;
use type_system::schema::ClosedEntityType;
use validation::{Validate, ValidateEntityComponents};

use crate::{
    snapshot::WriteBatch,
    store::{
        crud::Read,
        postgres::query::rows::{
            EntityDraftRow, EntityEditionRow, EntityEmbeddingRow, EntityHasLeftEntityRow,
            EntityHasRightEntityRow, EntityIdRow, EntityIsOfTypeRow, EntityTemporalMetadataRow,
        },
        query::Filter,
        AsClient, InsertionError, PostgresStore, StoreCache, StoreProvider,
    },
};

pub enum EntityRowBatch {
    Ids(Vec<EntityIdRow>),
    Drafts(Vec<EntityDraftRow>),
    Editions(Vec<EntityEditionRow>),
    Type(Vec<EntityIsOfTypeRow>),
    TemporalMetadata(Vec<EntityTemporalMetadataRow>),
    LeftLinks(Vec<EntityHasLeftEntityRow>),
    RightLinks(Vec<EntityHasRightEntityRow>),
    Embeddings(Vec<EntityEmbeddingRow>),
    Relations(Vec<(EntityUuid, EntityRelationAndSubject)>),
}

#[async_trait]
impl<C, A> WriteBatch<C, A> for EntityRowBatch
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
                    CREATE TEMPORARY TABLE entity_ids_tmp
                        (LIKE entity_ids INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_drafts_tmp
                        (LIKE entity_drafts INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_editions_tmp
                        (LIKE entity_editions INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_is_of_type_tmp
                        (LIKE entity_is_of_type INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_temporal_metadata_tmp
                        (LIKE entity_temporal_metadata INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_has_left_entity_tmp
                        (LIKE entity_has_left_entity INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_has_right_entity_tmp
                        (LIKE entity_has_right_entity INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_embeddings_tmp
                        (LIKE entity_embeddings INCLUDING ALL)
                        ON COMMIT DROP;
                ",
            )
            .await
            .change_context(InsertionError)
            .attach_printable("could not create temporary tables")?;
        Ok(())
    }

    #[expect(clippy::too_many_lines)]
    async fn write(
        self,
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Ids(ids) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_ids_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_ids[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&ids],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity ids", rows.len());
                }
            }
            Self::Drafts(drafts) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_drafts_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_drafts[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&drafts],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity draft ids", rows.len());
                }
            }
            Self::Editions(editions) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_editions_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_editions[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&editions],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity editions", rows.len());
                }
            }
            Self::Type(types) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_is_of_type_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_is_of_type[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&types],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity types", rows.len());
                }
            }
            Self::TemporalMetadata(temporal_metadata) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_temporal_metadata_tmp
                            SELECT * FROM UNNEST($1::entity_temporal_metadata[])
                            RETURNING 1;
                        ",
                        &[&temporal_metadata],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity temporal metadata", rows.len());
                }
            }
            Self::LeftLinks(links) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_has_left_entity_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_has_left_entity[])
                            RETURNING 1;
                        ",
                        &[&links],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} left entity links", rows.len());
                }
            }
            Self::RightLinks(links) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_has_right_entity_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_has_right_entity[])
                            RETURNING 1;
                        ",
                        &[&links],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} right entity links", rows.len());
                }
            }
            Self::Relations(relations) => {
                postgres_client
                    .authorization_api
                    .touch_relationships(relations)
                    .await
                    .change_context(InsertionError)?;
            }
            Self::Embeddings(embeddings) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_embeddings_tmp
                            SELECT * FROM UNNEST($1::entity_embeddings[])
                            RETURNING 1;
                        ",
                        &[&embeddings],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity embeddings", rows.len());
                }
            }
        }
        Ok(())
    }

    async fn commit(
        postgres_client: &mut PostgresStore<C, A>,
        validation: bool,
    ) -> Result<(), Report<InsertionError>> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    INSERT INTO entity_ids
                        SELECT * FROM entity_ids_tmp;

                    INSERT INTO entity_drafts
                        SELECT * FROM entity_drafts_tmp;

                    INSERT INTO entity_editions
                        SELECT * FROM entity_editions_tmp;

                    INSERT INTO entity_temporal_metadata
                        SELECT * FROM entity_temporal_metadata_tmp;

                    INSERT INTO entity_is_of_type
                        SELECT * FROM entity_is_of_type_tmp;

                    INSERT INTO entity_has_left_entity
                        SELECT * FROM entity_has_left_entity_tmp;

                    INSERT INTO entity_has_right_entity
                        SELECT * FROM entity_has_right_entity_tmp;

                    INSERT INTO entity_embeddings
                        SELECT * FROM entity_embeddings_tmp;
            ",
            )
            .await
            .change_context(InsertionError)?;

        if validation {
            let entities =
                Read::<Entity>::read_vec(postgres_client, &Filter::All(Vec::new()), None, true)
                    .await
                    .change_context(InsertionError)?;

            let schemas = postgres_client
                .read_closed_schemas(&Filter::All(Vec::new()), None)
                .await
                .change_context(InsertionError)?
                .try_collect::<HashMap<_, _>>()
                .await
                .change_context(InsertionError)?;

            let validator_provider = StoreProvider::<_, A> {
                store: postgres_client,
                cache: StoreCache::default(),
                authorization: None,
            };

            for entity in entities {
                let schema = entity
                    .metadata
                    .entity_type_ids
                    .iter()
                    .map(|id| {
                        schemas
                            .get(&EntityTypeId::from_url(id))
                            .ok_or(InsertionError)
                            .cloned()
                    })
                    .collect::<Result<ClosedEntityType, _>>()?;

                entity
                    .validate(
                        &schema,
                        if entity.metadata.record_id.entity_id.draft_id.is_some() {
                            ValidateEntityComponents::draft()
                        } else {
                            ValidateEntityComponents::full()
                        },
                        &validator_provider,
                    )
                    .await
                    .change_context(InsertionError)?;
            }
        }

        Ok(())
    }
}
