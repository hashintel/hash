use error_stack::{Report, ResultExt as _};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;

use crate::{
    snapshot::WriteBatch,
    store::{
        AsClient, PostgresStore,
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
