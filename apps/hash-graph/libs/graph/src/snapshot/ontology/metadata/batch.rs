use error_stack::{Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    snapshot::WriteBatch,
    store::{
        AsClient, InsertionError, PostgresStore,
        postgres::query::rows::{
            OntologyExternalMetadataRow, OntologyIdRow, OntologyOwnedMetadataRow,
            OntologyTemporalMetadataRow,
        },
    },
};

pub enum OntologyTypeMetadataRowBatch {
    Ids(Vec<OntologyIdRow>),
    TemporalMetadata(Vec<OntologyTemporalMetadataRow>),
    OwnedMetadata(Vec<OntologyOwnedMetadataRow>),
    ExternalMetadata(Vec<OntologyExternalMetadataRow>),
}

impl<C, A> WriteBatch<C, A> for OntologyTypeMetadataRowBatch
where
    C: AsClient,
    A: Send + Sync,
{
    async fn begin(postgres_client: &mut PostgresStore<C, A>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    CREATE TEMPORARY TABLE ontology_ids_tmp
                        (LIKE ontology_ids INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE ontology_temporal_metadata_tmp
                        (LIKE ontology_temporal_metadata INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE ontology_owned_metadata_tmp
                        (LIKE ontology_owned_metadata INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE ontology_external_metadata_tmp
                        (LIKE ontology_external_metadata INCLUDING ALL)
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
            Self::Ids(ontology_ids) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO ontology_ids_tmp
                            SELECT * FROM UNNEST($1::ontology_ids[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&ontology_ids],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} ontology ids", rows.len());
                }
            }
            Self::TemporalMetadata(ontology_temporal_metadata) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO ontology_temporal_metadata_tmp
                            SELECT * FROM UNNEST($1::ontology_temporal_metadata[])
                            RETURNING 1;
                        ",
                        &[&ontology_temporal_metadata],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} ontology temporal metadata", rows.len());
                }
            }
            Self::OwnedMetadata(ontology_owned_metadata) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO ontology_owned_metadata_tmp
                            SELECT DISTINCT * FROM UNNEST($1::ontology_owned_metadata[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&ontology_owned_metadata],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} ontology owned metadata", rows.len());
                }
            }
            Self::ExternalMetadata(ontology_external_metadata) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO ontology_external_metadata_tmp
                            SELECT DISTINCT * FROM UNNEST($1::ontology_external_metadata[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&ontology_external_metadata],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} ontology external metadata", rows.len());
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
                    INSERT INTO base_urls
                        SELECT DISTINCT base_url FROM ontology_ids_tmp;
                    INSERT INTO ontology_ids
                        SELECT * FROM ontology_ids_tmp;
                    INSERT INTO ontology_temporal_metadata
                        SELECT * FROM ontology_temporal_metadata_tmp;
                    INSERT INTO ontology_owned_metadata
                        SELECT * FROM ontology_owned_metadata_tmp;
                    INSERT INTO ontology_external_metadata
                        SELECT * FROM ontology_external_metadata_tmp;
                ",
            )
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
