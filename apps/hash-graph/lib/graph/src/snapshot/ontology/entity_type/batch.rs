use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    snapshot::{
        ontology::table::{
            EntityTypeConstrainsLinkDestinationsOnRow, EntityTypeConstrainsLinksOnRow,
            EntityTypeConstrainsPropertiesOnRow, EntityTypeInheritsFromRow, EntityTypeRow,
        },
        WriteBatch,
    },
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum EntityTypeRowBatch {
    Schema(Vec<EntityTypeRow>),
    InheritsFrom(Vec<EntityTypeInheritsFromRow>),
    ConstrainsProperties(Vec<EntityTypeConstrainsPropertiesOnRow>),
    ConstrainsLinks(Vec<EntityTypeConstrainsLinksOnRow>),
    ConstrainsLinkDestinations(Vec<EntityTypeConstrainsLinkDestinationsOnRow>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for EntityTypeRowBatch {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                r"
                    CREATE TEMPORARY TABLE entity_types_tmp
                        (LIKE entity_types INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_type_constrains_properties_on_tmp (
                        source_entity_type_ontology_id UUID NOT NULL,
                        target_property_type_base_url TEXT NOT NULL,
                        target_property_type_version INT8 NOT NULL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_type_inherits_from_tmp (
                        source_entity_type_ontology_id UUID NOT NULL,
                        target_entity_type_base_url TEXT NOT NULL,
                        target_entity_type_version INT8 NOT NULL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_type_constrains_links_on_tmp (
                        source_entity_type_ontology_id UUID NOT NULL,
                        target_entity_type_base_url TEXT NOT NULL,
                        target_entity_type_version INT8 NOT NULL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_type_constrains_link_destinations_on_tmp (
                        source_entity_type_ontology_id UUID NOT NULL,
                        target_entity_type_base_url TEXT NOT NULL,
                        target_entity_type_version INT8 NOT NULL
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
            Self::Schema(entity_types) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO entity_types_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_types[])
                            RETURNING 1;
                        ",
                        &[entity_types],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity type schemas", rows.len());
                }
            }
            Self::InheritsFrom(entity_types) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO entity_type_inherits_from_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_type_inherits_from_tmp[])
                            RETURNING 1;
                        ",
                        &[entity_types],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity type inheritance", rows.len());
                }
            }
            Self::ConstrainsProperties(properties) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO entity_type_constrains_properties_on_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_type_constrains_properties_on_tmp[])
                            RETURNING 1;
                        ",
                        &[properties],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity type property constrains", rows.len());
                }
            }
            Self::ConstrainsLinks(links) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO entity_type_constrains_links_on_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_type_constrains_links_on_tmp[])
                            RETURNING 1;
                        ",
                        &[links],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity type link constrains", rows.len());
                }
            }
            Self::ConstrainsLinkDestinations(links) => {
                let rows = client
                    .query(
                        r"
                            INSERT INTO entity_type_constrains_link_destinations_on_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_type_constrains_link_destinations_on_tmp[])
                            RETURNING 1;
                        ",
                        &[links],
                    )
                    .await
                    .into_report()
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!(
                        "Read {} entity type link destination constrains",
                        rows.len()
                    );
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
                    INSERT INTO entity_types SELECT * FROM entity_types_tmp;

                    INSERT INTO entity_type_inherits_from
                        SELECT
                            source_entity_type_ontology_id,
                            ontology_ids_tmp.ontology_id AS target_entity_type_ontology_id
                        FROM entity_type_inherits_from_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = entity_type_inherits_from_tmp.target_entity_type_base_url
                            AND ontology_ids_tmp.version = entity_type_inherits_from_tmp.target_entity_type_version;

                    INSERT INTO entity_type_constrains_properties_on
                        SELECT
                            source_entity_type_ontology_id,
                            ontology_ids_tmp.ontology_id AS target_entity_type_ontology_id
                        FROM entity_type_constrains_properties_on_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = entity_type_constrains_properties_on_tmp.target_property_type_base_url
                            AND ontology_ids_tmp.version = entity_type_constrains_properties_on_tmp.target_property_type_version;

                    INSERT INTO entity_type_constrains_links_on
                        SELECT
                            source_entity_type_ontology_id,
                            ontology_ids_tmp.ontology_id AS target_entity_type_ontology_id
                        FROM entity_type_constrains_links_on_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = entity_type_constrains_links_on_tmp.target_entity_type_base_url
                            AND ontology_ids_tmp.version = entity_type_constrains_links_on_tmp.target_entity_type_version;

                    INSERT INTO entity_type_constrains_link_destinations_on
                        SELECT
                            source_entity_type_ontology_id,
                            ontology_ids_tmp.ontology_id AS target_entity_type_ontology_id
                        FROM entity_type_constrains_link_destinations_on_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = entity_type_constrains_link_destinations_on_tmp.target_entity_type_base_url
                            AND ontology_ids_tmp.version = entity_type_constrains_link_destinations_on_tmp.target_entity_type_version;
                ",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        Ok(())
    }
}
