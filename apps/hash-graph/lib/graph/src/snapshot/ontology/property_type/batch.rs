use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    snapshot::{
        ontology::table::{
            PropertyTypeConstrainsPropertiesOnRow, PropertyTypeConstrainsValuesOnRow,
            PropertyTypeRow,
        },
        WriteBatch,
    },
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum PropertyTypeRowBatch {
    Schema(Vec<PropertyTypeRow>),
    ConstrainsValues(Vec<PropertyTypeConstrainsValuesOnRow>),
    ConstrainsProperties(Vec<PropertyTypeConstrainsPropertiesOnRow>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for PropertyTypeRowBatch {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                r"
                    CREATE TEMPORARY TABLE property_types_tmp
                        (LIKE property_types INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE property_type_constrains_values_on_tmp (
                        source_property_type_ontology_id UUID NOT NULL,
                        target_data_type_base_url TEXT NOT NULL,
                        target_data_type_version INT8 NOT NULL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE property_type_constrains_properties_on_tmp (
                        source_property_type_ontology_id UUID NOT NULL,
                        target_property_type_base_url TEXT NOT NULL,
                        target_property_type_version INT8 NOT NULL
                    ) ON COMMIT DROP;
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
            Self::Schema(property_types) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO property_types_tmp
                            SELECT DISTINCT * FROM UNNEST($1::property_types[])
                            RETURNING 1;
                        ",
                        &[property_types],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} property type schemas", rows.len());
                }
            }
            Self::ConstrainsValues(values) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO property_type_constrains_values_on_tmp
                            SELECT DISTINCT * FROM UNNEST($1::property_type_constrains_values_on_tmp[])
                            RETURNING 1;
                        ",
                        &[values],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} property type value constrains", rows.len());
                }
            }
            Self::ConstrainsProperties(properties) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO property_type_constrains_properties_on_tmp
                            SELECT DISTINCT * FROM UNNEST($1::property_type_constrains_properties_on_tmp[])
                            RETURNING 1;
                        ",
                        &[properties],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} property type property type constrains", rows.len());
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
                    INSERT INTO property_types SELECT * FROM property_types_tmp;

                    INSERT INTO property_type_constrains_values_on
                        SELECT
                            source_property_type_ontology_id,
                            ontology_ids_tmp.ontology_id AS target_data_type_ontology_id
                        FROM property_type_constrains_values_on_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = property_type_constrains_values_on_tmp.target_data_type_base_url
                            AND ontology_ids_tmp.version = property_type_constrains_values_on_tmp.target_data_type_version;

                    INSERT INTO property_type_constrains_properties_on
                        SELECT
                            source_property_type_ontology_id,
                            ontology_ids_tmp.ontology_id AS target_property_type_ontology_id
                        FROM property_type_constrains_properties_on_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = property_type_constrains_properties_on_tmp.target_property_type_base_url
                            AND ontology_ids_tmp.version = property_type_constrains_properties_on_tmp.target_property_type_version;
                ",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        Ok(())
    }
}
