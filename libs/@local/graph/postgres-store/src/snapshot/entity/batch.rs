use std::collections::HashMap;

use error_stack::{Report, ResultExt as _, ensure};
use futures::{StreamExt as _, TryStreamExt as _, stream};
use hash_graph_store::{
    entity::{EntityStore as _, EntityValidationReport, ValidateEntityComponents},
    error::InsertionError,
    query::Read,
};
use hash_graph_types::{
    knowledge::property::visitor::EntityVisitor as _, ontology::OntologyTypeProvider,
};
use hash_graph_validation::{EntityPreprocessor, Validate as _};
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;
use type_system::{
    knowledge::{Entity, property::PropertyObjectWithMetadata},
    ontology::entity_type::{ClosedEntityType, ClosedMultiEntityType},
};

use crate::{
    snapshot::WriteBatch,
    store::{
        StoreCache, StoreProvider,
        postgres::{
            AsClient, PostgresStore,
            query::rows::{
                EntityDraftRow, EntityEditionRow, EntityEmbeddingRow, EntityHasLeftEntityRow,
                EntityHasRightEntityRow, EntityIdRow, EntityIsOfTypeRow, EntityTemporalMetadataRow,
            },
        },
    },
};

pub enum EntityRowBatch {
    Ids(Vec<EntityIdRow>),
    Drafts(Vec<EntityDraftRow>),
    Editions(Vec<EntityEditionRow>),
    Type(Vec<EntityIsOfTypeRow>),
    TemporalMetadata(Vec<EntityTemporalMetadataRow>),
    LeftLinks(Vec<EntityHasLeftEntityRow>),
    RightLinks(Vec<EntityHasRightEntityRow>),
    Embeddings(Vec<EntityEmbeddingRow>),
}

impl<C> WriteBatch<C> for EntityRowBatch
where
    C: AsClient,
{
    async fn begin(postgres_client: &mut PostgresStore<C>) -> Result<(), Report<InsertionError>> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    CREATE TEMPORARY TABLE entity_ids_tmp
                        (LIKE entity_ids INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_drafts_tmp
                        (LIKE entity_drafts INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_editions_tmp
                        (LIKE entity_editions INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_is_of_type_tmp
                        (LIKE entity_is_of_type INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_temporal_metadata_tmp
                        (LIKE entity_temporal_metadata INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_has_left_entity_tmp
                        (LIKE entity_has_left_entity INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_has_right_entity_tmp
                        (LIKE entity_has_right_entity INCLUDING ALL)
                        ON COMMIT DROP;

                    CREATE TEMPORARY TABLE entity_embeddings_tmp
                        (LIKE entity_embeddings INCLUDING ALL)
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
            .attach_printable("could not create temporary tables")?;
        Ok(())
    }

    #[expect(clippy::too_many_lines)]
    async fn write(
        self,
        postgres_client: &mut PostgresStore<C>,
    ) -> Result<(), Report<InsertionError>> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Ids(ids) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_ids_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_ids[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&ids],
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
                    tracing::info!("Read {} entity ids", rows.len());
                }
            }
            Self::Drafts(drafts) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_drafts_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_drafts[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&drafts],
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
                    tracing::info!("Read {} entity draft ids", rows.len());
                }
            }
            Self::Editions(editions) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_editions_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_editions[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&editions],
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
                    tracing::info!("Read {} entity editions", rows.len());
                }
            }
            Self::Type(types) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_is_of_type_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_is_of_type[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&types],
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
                    tracing::info!("Read {} entity types", rows.len());
                }
            }
            Self::TemporalMetadata(temporal_metadata) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_temporal_metadata_tmp
                            SELECT * FROM UNNEST($1::entity_temporal_metadata[])
                            RETURNING 1;
                        ",
                        &[&temporal_metadata],
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
                    tracing::info!("Read {} entity temporal metadata", rows.len());
                }
            }
            Self::LeftLinks(links) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_has_left_entity_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_has_left_entity[])
                            RETURNING 1;
                        ",
                        &[&links],
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
                    tracing::info!("Read {} left entity links", rows.len());
                }
            }
            Self::RightLinks(links) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_has_right_entity_tmp
                            SELECT DISTINCT * FROM UNNEST($1::entity_has_right_entity[])
                            RETURNING 1;
                        ",
                        &[&links],
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
                    tracing::info!("Read {} right entity links", rows.len());
                }
            }
            Self::Embeddings(embeddings) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO entity_embeddings_tmp
                            SELECT * FROM UNNEST($1::entity_embeddings[])
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
                    tracing::info!("Read {} entity embeddings", rows.len());
                }
            }
        }
        Ok(())
    }

    #[expect(clippy::too_many_lines)]
    async fn commit(
        postgres_client: &mut PostgresStore<C>,
        ignore_validation_errors: bool,
    ) -> Result<(), Report<InsertionError>> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    INSERT INTO entity_ids
                        SELECT * FROM entity_ids_tmp;

                    INSERT INTO entity_drafts
                        SELECT * FROM entity_drafts_tmp;

                    INSERT INTO entity_editions
                        SELECT * FROM entity_editions_tmp;

                    INSERT INTO entity_temporal_metadata
                        SELECT * FROM entity_temporal_metadata_tmp;

                    INSERT INTO entity_is_of_type
                        SELECT * FROM entity_is_of_type_tmp;

                    INSERT INTO entity_has_left_entity
                        SELECT * FROM entity_has_left_entity_tmp;

                    INSERT INTO entity_has_right_entity
                        SELECT * FROM entity_has_right_entity_tmp;

                    INSERT INTO entity_embeddings
                        SELECT * FROM entity_embeddings_tmp;
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

        postgres_client
            .reindex_entity_cache()
            .await
            .change_context(InsertionError)?;

        let entities = Read::<Entity>::read_vec(postgres_client, &[], None, true)
            .await
            .change_context(InsertionError)?;

        let validator_provider = StoreProvider {
            store: postgres_client,
            cache: Box::new(StoreCache::default()),
            policy_components: None,
        };

        let mut edition_ids_updates = Vec::new();
        let mut properties_updates = Vec::new();
        let mut metadata_updates = Vec::new();

        let mut validation_reports = HashMap::<usize, EntityValidationReport>::new();
        for (index, mut entity) in entities.into_iter().enumerate() {
            let validation_components = if entity.metadata.record_id.entity_id.draft_id.is_some() {
                ValidateEntityComponents::draft()
            } else {
                ValidateEntityComponents::full()
            };
            let mut property_with_metadata = PropertyObjectWithMetadata::from_parts(
                entity.properties.clone(),
                Some(entity.metadata.properties.clone()),
            )
            .change_context(InsertionError)?;

            let entity_type = ClosedMultiEntityType::from_multi_type_closed_schema(
                stream::iter(&entity.metadata.entity_type_ids)
                    .then(|entity_type_url| async {
                        OntologyTypeProvider::<ClosedEntityType>::provide_type(
                            &validator_provider,
                            entity_type_url,
                        )
                        .await
                        .map(|entity_type| (*entity_type).clone())
                    })
                    .try_collect::<Vec<ClosedEntityType>>()
                    .await
                    .change_context(InsertionError)?,
            )
            .change_context(InsertionError)?;

            let mut preprocessor = EntityPreprocessor {
                components: validation_components,
            };

            if let Err(property_validation) = preprocessor
                .visit_object(
                    &entity_type,
                    &mut property_with_metadata,
                    &validator_provider,
                )
                .await
            {
                validation_reports.entry(index).or_default().properties =
                    property_validation.properties;
            }

            let (properties, metadata) = property_with_metadata.into_parts();
            let mut changed = false;

            // We avoid updating the entity if the properties and metadata are the same
            if entity.properties != properties || entity.metadata.properties != metadata {
                changed = true;
                entity.properties = properties;
                entity.metadata.properties = metadata;
            }

            let mut validation_components = ValidateEntityComponents {
                link_validation: postgres_client.settings.validate_links,
                ..if entity.metadata.record_id.entity_id.draft_id.is_some() {
                    ValidateEntityComponents::draft()
                } else {
                    ValidateEntityComponents::full()
                }
            };
            validation_components.link_validation = postgres_client.settings.validate_links;

            let validation_report = entity
                .validate(&entity_type, validation_components, &validator_provider)
                .await;
            if !validation_report.is_valid() {
                let validation = validation_reports.entry(index).or_default();
                validation.link = validation_report.link;
                validation.metadata.properties = validation_report.property_metadata;
            }

            if changed {
                edition_ids_updates.push(entity.metadata.record_id.edition_id);
                properties_updates.push(entity.properties);
                metadata_updates.push(entity.metadata.properties);
            }
        }

        if !validation_reports.is_empty() {
            tracing::warn!("Validation errored: {:?}", validation_reports);
            ensure!(ignore_validation_errors, InsertionError);
        }

        postgres_client
            .as_client()
            .client()
            .query(
                "
                    UPDATE entity_editions
                    SET
                        properties = data_table.properties,
                        property_metadata = data_table.property_metadata
                    FROM (
                        SELECT unnest($1::uuid[]) as edition_id,
                                unnest($2::jsonb[]) as properties,
                                unnest($3::jsonb[]) as property_metadata
                        ) as data_table
                    WHERE entity_editions.entity_edition_id = data_table.edition_id;
                ",
                &[&edition_ids_updates, &properties_updates, &metadata_updates],
            )
            .instrument(tracing::info_span!(
                "UPDATE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)?;

        Ok(())
    }
}
