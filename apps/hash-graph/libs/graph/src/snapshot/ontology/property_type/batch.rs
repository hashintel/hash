use std::collections::HashMap;

use async_trait::async_trait;
use authorization::{
    backend::ZanzibarBackend,
    schema::{PropertyTypeId, PropertyTypeRelationAndSubject},
};
use error_stack::{Result, ResultExt};
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
    Relations(HashMap<PropertyTypeId, Vec<PropertyTypeRelationAndSubject>>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for PropertyTypeRowBatch {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
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
                            SELECT DISTINCT * FROM \
                         UNNEST($1::property_type_constrains_values_on_tmp[])
                            RETURNING 1;
                        ",
                        &[&values],
                    )
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
                         UNNEST($1::property_type_constrains_properties_on_tmp[])
                            RETURNING 1;
                        ",
                        &[&properties],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} property type property type constrains", rows.len());
                }
            }
            #[expect(
                clippy::needless_collect,
                reason = "Lifetime error, probably the signatures are wrong"
            )]
            Self::Relations(relations) => {
                authorization_api
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
        }
        Ok(())
    }

    async fn commit(
        postgres_client: &PostgresStore<C>,
        _validation: bool,
    ) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    INSERT INTO property_types SELECT * FROM property_types_tmp;

                    INSERT INTO property_type_constrains_values_on
                        SELECT
                            source_property_type_ontology_id,
                            ontology_ids_tmp.ontology_id AS target_data_type_ontology_id
                        FROM property_type_constrains_values_on_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = \
                 property_type_constrains_values_on_tmp.target_data_type_base_url
                            AND ontology_ids_tmp.version = \
                 property_type_constrains_values_on_tmp.target_data_type_version;

                    INSERT INTO property_type_constrains_properties_on
                        SELECT
                            source_property_type_ontology_id,
                            ontology_ids_tmp.ontology_id AS target_property_type_ontology_id
                        FROM property_type_constrains_properties_on_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = \
                 property_type_constrains_properties_on_tmp.target_property_type_base_url
                            AND ontology_ids_tmp.version = \
                 property_type_constrains_properties_on_tmp.target_property_type_version;
                ",
            )
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
