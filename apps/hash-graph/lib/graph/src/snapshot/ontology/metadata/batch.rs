use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    snapshot::{
        ontology::{OntologyExternalMetadataRow, OntologyIdRow, OntologyOwnedMetadataRow},
        WriteBatch,
    },
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum OntologyTypeMetadataRowBatch {
    Ids(Vec<OntologyIdRow>),
    OwnedMetadata(Vec<OntologyOwnedMetadataRow>),
    ExternalMetadata(Vec<OntologyExternalMetadataRow>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for OntologyTypeMetadataRowBatch {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                r"
                    CREATE TEMPORARY TABLE ontology_ids_tmp
                        (LIKE ontology_ids INCLUDING ALL)
                       ON COMMIT DROP;
                    ALTER TABLE ontology_ids_tmp
                        ALTER COLUMN transaction_time
                        SET DEFAULT TSTZRANGE(now(), NULL, '[)');

                    CREATE TEMPORARY TABLE ontology_owned_metadata_tmp
                        (LIKE ontology_owned_metadata INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE ontology_external_metadata_tmp
                        (LIKE ontology_external_metadata INCLUDING ALL)
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
            Self::Ids(ontology_ids) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO ontology_ids_tmp
                            SELECT * FROM UNNEST($1::ontology_ids[])
                            RETURNING 1;
                        ",
                        &[ontology_ids],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} ontology ids", rows.len());
                }
            }
            Self::OwnedMetadata(ontology_owned_metadata) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO ontology_owned_metadata_tmp
                            SELECT DISTINCT * FROM UNNEST($1::ontology_owned_metadata[])
                            RETURNING 1;
                        ",
                        &[ontology_owned_metadata],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} ontology owned metadata", rows.len());
                }
            }
            Self::ExternalMetadata(ontology_external_metadata) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO ontology_external_metadata_tmp
                            SELECT DISTINCT * FROM UNNEST($1::ontology_external_metadata[])
                            RETURNING 1;
                        ",
                        &[ontology_external_metadata],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} ontology external metadata", rows.len());
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
                    INSERT INTO base_urls                  SELECT DISTINCT base_url FROM ontology_ids_tmp;
                    INSERT INTO ontology_ids               SELECT * FROM ontology_ids_tmp;
                    INSERT INTO ontology_owned_metadata    SELECT * FROM ontology_owned_metadata_tmp;
                    INSERT INTO ontology_external_metadata SELECT * FROM ontology_external_metadata_tmp;
                ",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        Ok(())
    }
}
