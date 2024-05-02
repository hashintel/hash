use std::collections::HashMap;

use async_trait::async_trait;
use authorization::{
    backend::ZanzibarBackend, schema::EntityTypeRelationAndSubject, AuthorizationApi,
};
use error_stack::{Result, ResultExt};
use futures::TryStreamExt;
use graph_types::ontology::EntityTypeId;
use postgres_types::{Json, ToSql};
use tokio_postgres::GenericClient;
use type_system::EntityType;

use crate::{
    snapshot::WriteBatch,
    store::{
        postgres::query::rows::{
            EntityTypeConstrainsLinkDestinationsOnRow, EntityTypeConstrainsLinksOnRow,
            EntityTypeConstrainsPropertiesOnRow, EntityTypeEmbeddingRow, EntityTypeInheritsFromRow,
            EntityTypeRow,
        },
        AsClient, InsertionError, PostgresStore,
    },
};

pub enum EntityTypeRowBatch {
    Schema(Vec<EntityTypeRow>),
    InheritsFrom(Vec<EntityTypeInheritsFromRow>),
    ConstrainsProperties(Vec<EntityTypeConstrainsPropertiesOnRow>),
    ConstrainsLinks(Vec<EntityTypeConstrainsLinksOnRow>),
    ConstrainsLinkDestinations(Vec<EntityTypeConstrainsLinkDestinationsOnRow>),
    Relations(HashMap<EntityTypeId, Vec<EntityTypeRelationAndSubject>>),
    Embeddings(Vec<EntityTypeEmbeddingRow<'static>>),
}

#[async_trait]
impl<C, A> WriteBatch<C, A> for EntityTypeRowBatch
where
    C: AsClient,
    A: ZanzibarBackend + AuthorizationApi,
{
    async fn begin(postgres_client: &mut PostgresStore<C, A>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    CREATE TEMPORARY TABLE entity_types_tmp (
                        LIKE entity_types INCLUDING ALL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_type_constrains_properties_on_tmp (
                        LIKE entity_type_constrains_properties_on INCLUDING ALL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_type_inherits_from_tmp (
                        LIKE entity_type_inherits_from INCLUDING ALL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_type_constrains_links_on_tmp (
                        LIKE entity_type_constrains_links_on INCLUDING ALL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_type_constrains_link_destinations_on_tmp (
                        LIKE entity_type_constrains_link_destinations_on INCLUDING ALL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_type_embeddings_tmp (
                        LIKE entity_type_embeddings INCLUDING ALL
                    ) ON COMMIT DROP;
                ",
            )
            .await
            .change_context(InsertionError)
            .attach_printable("could not create temporary tables")?;
        Ok(())
    }

    #[expect(clippy::too_many_lines)]
    async fn write(self, postgres_client: &mut PostgresStore<C, A>) -> Result<(), InsertionError> {
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
                            SELECT DISTINCT * FROM UNNEST($1::entity_type_inherits_from[])
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
                         UNNEST($1::entity_type_constrains_properties_on[])
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
                            SELECT DISTINCT * FROM UNNEST($1::entity_type_constrains_links_on[])
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
                         UNNEST($1::entity_type_constrains_link_destinations_on[])
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
            #[expect(
                clippy::needless_collect,
                reason = "Lifetime error, probably the signatures are wrong"
            )]
            Self::Relations(relations) => {
                postgres_client
                    .authorization_api
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
            Self::Embeddings(embeddings) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_type_embeddings_tmp
                            SELECT * FROM UNNEST($1::entity_type_embeddings[])
                            RETURNING 1;
                        ",
                        &[&embeddings],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} entity type embeddings", rows.len());
                }
            }
        }
        Ok(())
    }

    async fn commit(
        postgres_client: &mut PostgresStore<C, A>,
        _validation: bool,
    ) -> Result<(), InsertionError> {
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
            .map_ok(|row| {
                let Json(schema): Json<EntityType> = row.get(1);
                schema
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
                    INSERT INTO entity_types
                        SELECT * FROM entity_types_tmp;

                    INSERT INTO entity_type_inherits_from
                        SELECT * FROM entity_type_inherits_from_tmp;

                    INSERT INTO entity_type_constrains_properties_on
                        SELECT * FROM entity_type_constrains_properties_on_tmp;

                    INSERT INTO entity_type_constrains_links_on
                        SELECT * FROM entity_type_constrains_links_on_tmp;

                    INSERT INTO entity_type_constrains_link_destinations_on
                        SELECT * FROM entity_type_constrains_link_destinations_on_tmp;

                    INSERT INTO entity_type_embeddings
                        SELECT * FROM entity_type_embeddings_tmp;
                ",
            )
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
