use std::collections::{HashMap, HashSet};

use async_trait::async_trait;
#[cfg(hash_graph_test_environment)]
use error_stack::IntoReport;
use error_stack::{Report, Result, ResultExt};
use futures::{stream, TryStreamExt};
use graph_types::{
    ontology::{
        EntityTypeMetadata, EntityTypeWithMetadata, OntologyTemporalMetadata, OntologyTypeRecordId,
        PartialCustomEntityTypeMetadata, PartialCustomOntologyMetadata, PartialEntityTypeMetadata,
    },
    provenance::{ProvenanceMetadata, RecordArchivedById, RecordCreatedById},
};
use temporal_versioning::RightBoundedTemporalInterval;
use type_system::{
    url::{BaseUrl, VersionedUrl},
    EntityType,
};

#[cfg(hash_graph_test_environment)]
use crate::store::error::DeletionError;
use crate::{
    store::{
        crud::Read,
        postgres::{
            ontology::{read::OntologyTypeTraversalData, OntologyId},
            query::ReferenceTable,
            TraversalContext,
        },
        AsClient, ConflictBehavior, EntityTypeStore, InsertionError, PostgresStore, QueryError,
        Record, UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, OntologyEdgeKind},
        identifier::{EntityTypeVertexId, PropertyTypeVertexId},
        query::StructuralQuery,
        temporal_axes::VariableAxis,
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`EntityTypeWithMetadata`] into four [`TraversalContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "trace", skip(self, traversal_context, subgraph))]
    pub(crate) async fn traverse_entity_types(
        &self,
        mut entity_type_queue: Vec<(
            OntologyId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let mut property_type_queue = Vec::new();

        while !entity_type_queue.is_empty() {
            let mut edges_to_traverse =
                HashMap::<OntologyEdgeKind, OntologyTypeTraversalData>::new();

            #[expect(clippy::iter_with_drain, reason = "false positive, vector is reused")]
            for (entity_type_ontology_id, graph_resolve_depths, traversal_interval) in
                entity_type_queue.drain(..)
            {
                for edge_kind in [
                    OntologyEdgeKind::ConstrainsPropertiesOn,
                    OntologyEdgeKind::InheritsFrom,
                    OntologyEdgeKind::ConstrainsLinksOn,
                    OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                ] {
                    if let Some(new_graph_resolve_depths) = graph_resolve_depths
                        .decrement_depth_for_edge(edge_kind, EdgeDirection::Outgoing)
                    {
                        edges_to_traverse.entry(edge_kind).or_default().push(
                            entity_type_ontology_id,
                            new_graph_resolve_depths,
                            traversal_interval,
                        );
                    }
                }
            }

            if let Some(traversal_data) =
                edges_to_traverse.get(&OntologyEdgeKind::ConstrainsPropertiesOn)
            {
                property_type_queue.extend(
                    self.read_ontology_edges::<EntityTypeVertexId, PropertyTypeVertexId>(
                        traversal_data,
                        ReferenceTable::EntityTypeConstrainsPropertiesOn {
                            inheritance_depth: None,
                        },
                    )
                    .await?
                    .flat_map(|edge| {
                        subgraph.insert_edge(
                            &edge.left_endpoint,
                            OntologyEdgeKind::ConstrainsPropertiesOn,
                            EdgeDirection::Outgoing,
                            edge.right_endpoint.clone(),
                        );

                        traversal_context.add_property_type_id(
                            edge.right_endpoint_ontology_id,
                            edge.resolve_depths,
                            edge.traversal_interval,
                        )
                    }),
                );
            }

            for (edge_kind, table) in [
                (
                    OntologyEdgeKind::InheritsFrom,
                    ReferenceTable::EntityTypeInheritsFrom {
                        inheritance_depth: None,
                    },
                ),
                (
                    OntologyEdgeKind::ConstrainsLinksOn,
                    ReferenceTable::EntityTypeConstrainsLinksOn {
                        inheritance_depth: None,
                    },
                ),
                (
                    OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                    ReferenceTable::EntityTypeConstrainsLinkDestinationsOn {
                        inheritance_depth: None,
                    },
                ),
            ] {
                if let Some(traversal_data) = edges_to_traverse.get(&edge_kind) {
                    entity_type_queue.extend(
                        self.read_ontology_edges::<EntityTypeVertexId, EntityTypeVertexId>(
                            traversal_data,
                            table,
                        )
                        .await?
                        .flat_map(|edge| {
                            subgraph.insert_edge(
                                &edge.left_endpoint,
                                edge_kind,
                                EdgeDirection::Outgoing,
                                edge.right_endpoint.clone(),
                            );

                            traversal_context.add_entity_type_id(
                                edge.right_endpoint_ontology_id,
                                edge.resolve_depths,
                                edge.traversal_interval,
                            )
                        }),
                    );
                }
            }
        }

        self.traverse_property_types(property_type_queue, traversal_context, subgraph)
            .await?;

        Ok(())
    }

    #[tracing::instrument(level = "trace", skip(self))]
    #[cfg(hash_graph_test_environment)]
    pub async fn delete_entity_types(&mut self) -> Result<(), DeletionError> {
        let transaction = self.transaction().await.change_context(DeletionError)?;

        transaction
            .as_client()
            .simple_query(
                r"
                    DELETE FROM entity_type_inherits_from;
                    DELETE FROM entity_type_constrains_link_destinations_on;
                    DELETE FROM entity_type_constrains_links_on;
                    DELETE FROM entity_type_constrains_properties_on;
                ",
            )
            .await
            .into_report()
            .change_context(DeletionError)?;

        let entity_types = transaction
            .as_client()
            .query(
                r"
                    DELETE FROM entity_types
                    RETURNING ontology_id
                ",
                &[],
            )
            .await
            .into_report()
            .change_context(DeletionError)?
            .into_iter()
            .filter_map(|row| row.get(0))
            .collect::<Vec<OntologyId>>();

        transaction.delete_ontology_ids(&entity_types).await?;

        transaction.commit().await.change_context(DeletionError)?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> EntityTypeStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, entity_types))]
    async fn create_entity_types(
        &mut self,
        entity_types: impl IntoIterator<Item = (EntityType, PartialEntityTypeMetadata), IntoIter: Send>
        + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<Vec<EntityTypeMetadata>, InsertionError> {
        let entity_types = entity_types.into_iter();
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let mut inserted_entity_types = Vec::new();
        let mut inserted_entity_type_metadata =
            Vec::with_capacity(inserted_entity_types.capacity());
        for (schema, metadata) in entity_types {
            if let Some((ontology_id, transaction_time)) = transaction
                .create_ontology_metadata(&metadata.record_id, &metadata.custom.common, on_conflict)
                .await?
            {
                transaction
                    .insert_entity_type_with_id(
                        ontology_id,
                        schema.clone(),
                        metadata.custom.label_property.as_ref(),
                    )
                    .await?;

                inserted_entity_types.push((ontology_id, schema));
                inserted_entity_type_metadata
                    .push(EntityTypeMetadata::from_partial(metadata, transaction_time));
            }
        }

        for (ontology_id, schema) in inserted_entity_types {
            transaction
                .insert_entity_type_references(&schema, ontology_id)
                .await
                .change_context(InsertionError)
                .attach_printable_lazy(|| {
                    format!(
                        "could not insert references for entity type: {}",
                        schema.id()
                    )
                })
                .attach_lazy(|| schema.clone())?;
        }

        transaction.commit().await.change_context(InsertionError)?;

        Ok(inserted_entity_type_metadata)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_entity_type(
        &self,
        query: &StructuralQuery<EntityTypeWithMetadata>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
            temporal_axes: ref unresolved_temporal_axes,
        } = *query;

        let temporal_axes = unresolved_temporal_axes.clone().resolve();
        let time_axis = temporal_axes.variable_time_axis();

        let mut subgraph = Subgraph::new(
            graph_resolve_depths,
            unresolved_temporal_axes.clone(),
            temporal_axes.clone(),
        );

        if graph_resolve_depths.is_empty() {
            // TODO: Remove again when subgraph logic was revisited
            //   see https://linear.app/hash/issue/H-297
            let mut visited_ontology_ids = HashSet::new();

            subgraph.vertices.entity_types =
                Read::<EntityTypeWithMetadata>::read_vec(self, filter, Some(&temporal_axes))
                    .await?
                    .into_iter()
                    .filter_map(|entity_type| {
                        // The records are already sorted by time, so we can just take the first
                        // one
                        visited_ontology_ids
                            .insert(entity_type.vertex_id(time_axis))
                            .then(|| (entity_type.vertex_id(time_axis), entity_type))
                    })
                    .collect();
            for vertex_id in subgraph.vertices.entity_types.keys() {
                subgraph.roots.insert(vertex_id.clone().into());
            }
        } else {
            let mut traversal_context = TraversalContext::default();
            let traversal_data = self
                .read_ontology_ids::<EntityTypeWithMetadata>(filter, Some(&temporal_axes))
                .await?
                .map_ok(|(vertex_id, ontology_id)| {
                    subgraph.roots.insert(vertex_id.into());
                    stream::iter(
                        traversal_context
                            .add_entity_type_id(
                                ontology_id,
                                graph_resolve_depths,
                                temporal_axes.variable_interval(),
                            )
                            .map(Ok::<_, Report<QueryError>>),
                    )
                })
                .try_flatten()
                .try_collect::<Vec<_>>()
                .await?;

            self.traverse_entity_types(traversal_data, &mut traversal_context, &mut subgraph)
                .await?;

            traversal_context
                .read_traversed_vertices(self, &mut subgraph)
                .await?;
        }

        Ok(subgraph)
    }

    #[tracing::instrument(level = "info", skip(self, entity_type))]
    async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
        record_created_by_id: RecordCreatedById,
        label_property: Option<BaseUrl>,
    ) -> Result<EntityTypeMetadata, UpdateError> {
        let transaction = self.transaction().await.change_context(UpdateError)?;

        let url = entity_type.id();
        let record_id = OntologyTypeRecordId::from(url.clone());

        let (ontology_id, owned_by_id, transaction_time) = transaction
            .update_owned_ontology_id(url, record_created_by_id)
            .await?;
        transaction
            .insert_entity_type_with_id(ontology_id, entity_type.clone(), label_property.as_ref())
            .await
            .change_context(UpdateError)?;

        let metadata = PartialEntityTypeMetadata {
            record_id,
            custom: PartialCustomEntityTypeMetadata {
                common: PartialCustomOntologyMetadata::Owned {
                    provenance: ProvenanceMetadata {
                        record_created_by_id,
                        record_archived_by_id: None,
                    },
                    owned_by_id,
                },
                label_property,
            },
        };

        transaction
            .insert_entity_type_references(&entity_type, ontology_id)
            .await
            .change_context(UpdateError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for entity type: {}",
                    entity_type.id()
                )
            })
            .attach_lazy(|| entity_type.clone())?;

        transaction.commit().await.change_context(UpdateError)?;

        Ok(EntityTypeMetadata::from_partial(metadata, transaction_time))
    }

    async fn archive_entity_type(
        &mut self,
        id: &VersionedUrl,
        record_archived_by_id: RecordArchivedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.archive_ontology_type(id, record_archived_by_id).await
    }

    async fn unarchive_entity_type(
        &mut self,
        id: &VersionedUrl,
        record_created_by_id: RecordCreatedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.unarchive_ontology_type(id, record_created_by_id).await
    }
}
