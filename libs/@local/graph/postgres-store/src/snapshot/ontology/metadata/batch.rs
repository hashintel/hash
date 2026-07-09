use error_stack::{Report, ResultExt as _};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;

use crate::{
    snapshot::{SnapshotInsertOptions, WriteBatch, insert_rows_batch},
    store::{
        AsClient, PostgresStore,
        postgres::query::{
            OnConflict,
            rows::{
                OntologyExternalMetadataRow, OntologyIdRow, OntologyOwnedMetadataRow,
                OntologyTemporalMetadataRow,
            },
        },
    },
};

pub enum OntologyTypeMetadataRowBatch {
    Ids(Vec<OntologyIdRow>),
    TemporalMetadata(Vec<OntologyTemporalMetadataRow>),
    OwnedMetadata(Vec<OntologyOwnedMetadataRow>),
    ExternalMetadata(Vec<OntologyExternalMetadataRow>),
}

impl<C> WriteBatch<C> for OntologyTypeMetadataRowBatch
where
    C: AsClient,
{
    async fn begin(postgres_client: &mut PostgresStore<C>) -> Result<(), Report<InsertionError>> {
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
            .instrument(tracing::info_span!(
                "CREATE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)
            .attach("could not create temporary tables")?;
        Ok(())
    }

    async fn write(
        self,
        postgres_client: &mut PostgresStore<C>,
    ) -> Result<(), Report<InsertionError>> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Ids(ontology_ids) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &ontology_ids,
                    SnapshotInsertOptions {
                        distinct: false,
                        on_conflict: OnConflict::DoNothing,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} ontology ids");
                }
            }
            Self::TemporalMetadata(ontology_temporal_metadata) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &ontology_temporal_metadata,
                    SnapshotInsertOptions {
                        distinct: false,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} ontology temporal metadata");
                }
            }
            Self::OwnedMetadata(ontology_owned_metadata) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &ontology_owned_metadata,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::DoNothing,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} ontology owned metadata");
                }
            }
            Self::ExternalMetadata(ontology_external_metadata) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &ontology_external_metadata,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::DoNothing,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} ontology external metadata");
                }
            }
        }
        Ok(())
    }

    async fn commit(
        postgres_client: &mut PostgresStore<C>,
        _ignore_validation_errors: bool,
    ) -> Result<(), Report<InsertionError>> {
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
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
