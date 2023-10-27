use async_trait::async_trait;
use authorization::{
    backend::ZanzibarBackend,
    schema::{EntityTypeId, EntityTypeRelationAndSubject},
};
use error_stack::{Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use postgres_types::{Json, ToSql};
use tokio_postgres::GenericClient;
use type_system::{raw, EntityType};

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
    Relations(Vec<(EntityTypeId, EntityTypeRelationAndSubject)>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for EntityTypeRowBatch {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
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
            Self::Schema(entity_types) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_types_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_types[])
                            RETURNING 1;
                        ",
                        &[&entity_types],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity type schemas", rows.len());
                }
            }
            Self::InheritsFrom(entity_types) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_type_inherits_from_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_type_inherits_from_tmp[])
                            RETURNING 1;
                        ",
                        &[&entity_types],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity type inheritance", rows.len());
                }
            }
            Self::ConstrainsProperties(properties) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_type_constrains_properties_on_tmp
                            SELECT DISTINCT * FROM \
                         UNNEST($1::entity_type_constrains_properties_on_tmp[])
                            RETURNING 1;
                        ",
                        &[&properties],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity type property constrains", rows.len());
                }
            }
            Self::ConstrainsLinks(links) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_type_constrains_links_on_tmp
                            SELECT DISTINCT * FROM \
                         UNNEST($1::entity_type_constrains_links_on_tmp[])
                            RETURNING 1;
                        ",
                        &[&links],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity type link constrains", rows.len());
                }
            }
            Self::ConstrainsLinkDestinations(links) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_type_constrains_link_destinations_on_tmp
                            SELECT DISTINCT * FROM \
                         UNNEST($1::entity_type_constrains_link_destinations_on_tmp[])
                            RETURNING 1;
                        ",
                        &[&links],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!(
                        "Read {} entity type link destination constrains",
                        rows.len()
                    );
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

    #[expect(clippy::too_many_lines, reason = "TODO: Move out common parts")]
    async fn commit(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        // Insert types which don't need updating so they are available in the graph for the resolve
        // step below.
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    WITH removed_entity_type AS (
                        DELETE FROM entity_types_tmp
                        WHERE schema->'allOf' IS NULL
                        RETURNING entity_types_tmp.*
                    )
                    INSERT INTO entity_types SELECT * FROM removed_entity_type;
                ",
            )
            .await
            .change_context(InsertionError)?;

        // We still need to update the closed schema for the types which have a parent.
        let schemas = postgres_client
            .as_client()
            .client()
            .query_raw(
                "SELECT ontology_id, schema FROM entity_types_tmp",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(InsertionError)?
            .map(|row| {
                let schema: Json<raw::EntityType> = row.change_context(InsertionError)?.get(1);
                // TODO: Distinguish between format validation and content validation so it's
                //       possible to directly use the raw representation
                //   see https://linear.app/hash/issue/BP-33
                EntityType::try_from(schema.0).change_context(InsertionError)
            })
            .try_collect::<Vec<_>>()
            .await
            .change_context(InsertionError)?;

        // `resolve_entity_types` can use entity types from both, the Graph and passed schemas.
        let (ids, closed_schemas): (Vec<_>, Vec<_>) = postgres_client
            .resolve_entity_types(schemas)
            .await
            .change_context(InsertionError)?
            .into_iter()
            .map(|insertion| {
                (
                    EntityTypeId::from_url(insertion.schema.id()).into_uuid(),
                    Json(insertion.closed_schema),
                )
            })
            .unzip();

        postgres_client
            .as_client()
            .client()
            .query(
                "
                    UPDATE entity_types_tmp
                       SET closed_schema = param.closed_schema
                      FROM (
                               SELECT *
                                 FROM UNNEST($1::uuid[], $2::jsonb[])
                                   AS t(ontology_id, closed_schema)
                           )
                        AS param
                     WHERE entity_types_tmp.ontology_id = param.ontology_id;
                ",
                &[&ids, &closed_schemas],
            )
            .await
            .change_context(InsertionError)?;

        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    INSERT INTO entity_types SELECT * FROM entity_types_tmp;

                    INSERT INTO entity_type_inherits_from
                        SELECT
                            source_entity_type_ontology_id,
                            ontology_ids_tmp.ontology_id AS target_entity_type_ontology_id
                        FROM entity_type_inherits_from_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = \
                 entity_type_inherits_from_tmp.target_entity_type_base_url
                            AND ontology_ids_tmp.version = \
                 entity_type_inherits_from_tmp.target_entity_type_version;

                    INSERT INTO entity_type_constrains_properties_on
                        SELECT
                            source_entity_type_ontology_id,
                            ontology_ids_tmp.ontology_id AS target_entity_type_ontology_id
                        FROM entity_type_constrains_properties_on_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = \
                 entity_type_constrains_properties_on_tmp.target_property_type_base_url
                            AND ontology_ids_tmp.version = \
                 entity_type_constrains_properties_on_tmp.target_property_type_version;

                    INSERT INTO entity_type_constrains_links_on
                        SELECT
                            source_entity_type_ontology_id,
                            ontology_ids_tmp.ontology_id AS target_entity_type_ontology_id
                        FROM entity_type_constrains_links_on_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = \
                 entity_type_constrains_links_on_tmp.target_entity_type_base_url
                            AND ontology_ids_tmp.version = \
                 entity_type_constrains_links_on_tmp.target_entity_type_version;

                    INSERT INTO entity_type_constrains_link_destinations_on
                        SELECT
                            source_entity_type_ontology_id,
                            ontology_ids_tmp.ontology_id AS target_entity_type_ontology_id
                        FROM entity_type_constrains_link_destinations_on_tmp
                        INNER JOIN ontology_ids_tmp ON
                            ontology_ids_tmp.base_url = \
                 entity_type_constrains_link_destinations_on_tmp.target_entity_type_base_url
                            AND ontology_ids_tmp.version = \
                 entity_type_constrains_link_destinations_on_tmp.target_entity_type_version;
                ",
            )
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
