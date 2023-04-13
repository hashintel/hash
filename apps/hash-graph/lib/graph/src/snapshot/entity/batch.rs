use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    snapshot::{
        entity::{EntityEditionRow, EntityIdRow, EntityLinkEdgeRow, EntityTemporalMetadataRow},
        WriteBatch,
    },
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum EntityRowBatch {
    Ids(Vec<EntityIdRow>),
    Editions(Vec<EntityEditionRow>),
    TemporalMetadata(Vec<EntityTemporalMetadataRow>),
    Links(Vec<EntityLinkEdgeRow>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for EntityRowBatch {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                r"
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
                        owned_by_id UUID NOT NULL,
                        entity_uuid UUID NOT NULL,
                        left_owned_by_id UUID NOT NULL,
                        left_entity_uuid UUID NOT NULL,
                        right_owned_by_id UUID NOT NULL,
                        right_entity_uuid UUID NOT NULL
                    );
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
            Self::Ids(ids) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO entity_ids_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_ids[])
                            RETURNING 1;
                        ",
                        &[ids],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity ids", rows.len());
                }
            }
            Self::Editions(editions) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO entity_editions_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_editions_tmp[])
                            RETURNING 1;
                        ",
                        &[editions],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity editions", rows.len());
                }
            }
            Self::TemporalMetadata(temporal_metadata) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO entity_temporal_metadata_tmp
                            SELECT * FROM UNNEST($1::entity_temporal_metadata[])
                            RETURNING 1;
                        ",
                        &[temporal_metadata],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity temporal metadata", rows.len());
                }
            }
            Self::Links(links) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO entity_link_edges_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_link_edges_tmp[])
                            RETURNING 1;
                        ",
                        &[links],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity links", rows.len());
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

                    INSERT INTO entity_temporal_metadata SELECT * FROM entity_temporal_metadata_tmp;

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
                            owned_by_id UUID,
                            entity_uuid UUID,
                            left_owned_by_id UUID,
                            left_entity_uuid UUID
                        FROM entity_link_edges_tmp;

                    INSERT INTO entity_has_right_entity
                        SELECT
                            owned_by_id UUID,
                            entity_uuid UUID,
                            right_owned_by_id UUID,
                            right_entity_uuid UUID
                        FROM entity_link_edges_tmp;
            ",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        Ok(())
    }
}
