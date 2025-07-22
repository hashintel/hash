use error_stack::{Report, ResultExt as _};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;

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
    Embeddings(Vec<PropertyTypeEmbeddingRow<'static>>),
}

impl<C> WriteBatch<C> for PropertyTypeRowBatch
where
    C: AsClient,
{
    async fn begin(postgres_client: &mut PostgresStore<C>) -> Result<(), Report<InsertionError>> {
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
            .instrument(tracing::info_span!(
                "CREATE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)
            .attach_printable("could not create temporary tables")?;
        Ok(())
    }

    async fn write(
        self,
        postgres_client: &mut PostgresStore<C>,
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} property type property type constrains", rows.len());
                }
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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
        postgres_client: &mut PostgresStore<C>,
        _ignore_validation_errors: bool,
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
