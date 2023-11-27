use std::collections::HashMap;

use async_trait::async_trait;
use authorization::{
    backend::ZanzibarBackend,
    schema::{EntityRelationAndSubject, EntityTypeId},
    NoAuthorization,
};
use error_stack::{Result, ResultExt};
use futures::TryStreamExt;
use graph_types::knowledge::entity::{Entity, EntityUuid};
use tokio_postgres::GenericClient;
use validation::Validate;

use crate::{
    snapshot::{
        entity::{EntityEditionRow, EntityIdRow, EntityLinkEdgeRow, EntityTemporalMetadataRow},
        WriteBatch,
    },
    store::{
        crud::Read, query::Filter, AsClient, InsertionError, PostgresStore, StoreCache,
        StoreProvider,
    },
};

pub enum EntityRowBatch {
    Ids(Vec<EntityIdRow>),
    Editions(Vec<EntityEditionRow>),
    TemporalMetadata(Vec<EntityTemporalMetadataRow>),
    Links(Vec<EntityLinkEdgeRow>),
    Relations(HashMap<EntityUuid, EntityRelationAndSubject>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for EntityRowBatch {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    CREATE TEMPORARY TABLE entity_ids_tmp
                        (LIKE entity_ids INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_editions_tmp (
                        entity_edition_id UUID PRIMARY KEY,
                        properties JSONB NOT NULL,
                        left_to_right_order INTEGER,
                        right_to_left_order INTEGER,
                        record_created_by_id UUID NOT NULL,
                        archived BOOLEAN NOT NULL,
                        entity_type_base_url TEXT NOT NULL,
                        entity_type_version INT8 NOT NULL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_temporal_metadata_tmp
                        (LIKE entity_temporal_metadata INCLUDING ALL)
                        ON COMMIT DROP;
                    ALTER TABLE entity_temporal_metadata_tmp
                        ALTER COLUMN transaction_time
                        SET DEFAULT TSTZRANGE(now(), NULL, '[)');

                    CREATE TEMPORARY TABLE entity_link_edges_tmp (
                        web_id UUID NOT NULL,
                        entity_uuid UUID NOT NULL,
                        left_web_id UUID NOT NULL,
                        left_entity_uuid UUID NOT NULL,
                        right_web_id UUID NOT NULL,
                        right_entity_uuid UUID NOT NULL
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
        postgres_client: &PostgresStore<C>,
        authorization_api: &mut (impl ZanzibarBackend + Send),
    ) -> Result<(), InsertionError> {
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
            Self::Editions(editions) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_editions_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_editions_tmp[])
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
            Self::Links(links) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_link_edges_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_link_edges_tmp[])
                            RETURNING 1;
                        ",
                        &[&links],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity links", rows.len());
                }
            }
            Self::Relations(relations) => {
                authorization_api
                    .touch_relationships(relations)
                    .await
                    .change_context(InsertionError)?;
            }
        }
        Ok(())
    }

    async fn commit(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    INSERT INTO entity_ids SELECT * FROM entity_ids_tmp;

                    INSERT INTO entity_editions
                        SELECT
                            entity_edition_id UUID,
                            properties JSONB,
                            left_to_right_order INT4,
                            right_to_left_order INT4,
                            record_created_by_id UUID,
                            archived BOOLEAN
                        FROM entity_editions_tmp;

                    INSERT INTO entity_temporal_metadata SELECT * FROM \
                 entity_temporal_metadata_tmp;

                    INSERT INTO entity_is_of_type
                        SELECT
                            entity_edition_id,
                            ontology_ids_tmp.ontology_id AS entity_type_ontology_id
                        FROM entity_editions_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = entity_editions_tmp.entity_type_base_url
                            AND ontology_ids_tmp.version = entity_editions_tmp.entity_type_version;

                    INSERT INTO entity_has_left_entity
                        SELECT
                            web_id UUID,
                            entity_uuid UUID,
                            left_web_id UUID,
                            left_entity_uuid UUID
                        FROM entity_link_edges_tmp;

                    INSERT INTO entity_has_right_entity
                        SELECT
                            web_id UUID,
                            entity_uuid UUID,
                            right_web_id UUID,
                            right_entity_uuid UUID
                        FROM entity_link_edges_tmp;
            ",
            )
            .await
            .change_context(InsertionError)?;

        let entities = Read::<Entity>::read_vec(postgres_client, &Filter::All(Vec::new()), None)
            .await
            .change_context(InsertionError)?;

        let schemas = postgres_client
            .read_closed_schemas(&Filter::All(Vec::new()), None)
            .await
            .change_context(InsertionError)?
            .try_collect::<HashMap<_, _>>()
            .await
            .change_context(InsertionError)?;

        let validator_provider = StoreProvider::<_, NoAuthorization> {
            store: postgres_client,
            cache: StoreCache::default(),
            authorization: None,
        };

        for entity in entities {
            let entity_type_id = EntityTypeId::from_url(entity.metadata.entity_type_id());
            let schema = schemas.get(&entity_type_id).ok_or(InsertionError)?;
            entity
                .validate(schema, &validator_provider)
                .await
                .change_context(InsertionError)?;
        }

        Ok(())
    }
}
