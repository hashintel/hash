use std::{borrow::Borrow, mem};

use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use type_system::EntityType;

use crate::{
    ontology::{EntityTypeWithMetadata, OntologyElementMetadata, PropertyTypeWithMetadata},
    provenance::UpdatedById,
    store::{
        crud::Read, postgres::TraversalContext, query::Filter, AsClient, EntityTypeStore,
        InsertionError, PostgresStore, QueryError, Record, UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, OntologyEdgeKind, OutgoingEdgeResolveDepth},
        identifier::EntityTypeVertexId,
        query::StructuralQuery,
        temporal_axes::QueryTemporalAxes,
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
        mut entity_type_queue: Vec<(EntityTypeVertexId, GraphResolveDepths, QueryTemporalAxes)>,
        traversal_context: &mut TraversalContext,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let time_axis = subgraph.temporal_axes.resolved.variable_time_axis();

        let mut property_type_queue = Vec::new();

        while !entity_type_queue.is_empty() {
            // TODO: We could re-use the memory here but we expect to batch the processing of this
            //       for-loop. See https://app.asana.com/0/0/1204117847656663/f
            for (entity_type_vertex_id, graph_resolve_depths, temporal_axes) in
                mem::take(&mut entity_type_queue)
            {
                if graph_resolve_depths.constrains_properties_on.outgoing > 0 {
                    tracing::trace!(
                        "reading property types for `{}v/{}`",
                        entity_type_vertex_id.base_id.as_str(),
                        entity_type_vertex_id.revision_id.inner()
                    );
                    for property_type in <Self as Read<PropertyTypeWithMetadata>>::read(
                        self,
                        &Filter::<PropertyTypeWithMetadata>::for_ontology_edge_by_entity_type_vertex_id(
                            &entity_type_vertex_id,
                            OntologyEdgeKind::ConstrainsPropertiesOn,
                        ),
                        &temporal_axes,
                    )
                        .await?
                    {
                        let property_type_vertex_id = property_type.vertex_id(time_axis);

                        subgraph.insert_edge(
                            &entity_type_vertex_id,
                            OntologyEdgeKind::ConstrainsPropertiesOn,
                            EdgeDirection::Outgoing,
                            property_type_vertex_id.clone(),
                        );

                        subgraph.insert_vertex(&property_type_vertex_id, property_type);

                        property_type_queue.push((
                            property_type_vertex_id,
                            GraphResolveDepths {
                                constrains_properties_on: OutgoingEdgeResolveDepth {
                                    outgoing: graph_resolve_depths.constrains_properties_on.outgoing
                                        - 1,
                                    ..graph_resolve_depths.constrains_properties_on
                                },
                                ..graph_resolve_depths
                            },
                            temporal_axes.clone()
                        ));
                    }
                }

                if graph_resolve_depths.inherits_from.outgoing > 0 {
                    for referenced_entity_type in <Self as Read<EntityTypeWithMetadata>>::read(
                        self,
                        &Filter::<EntityTypeWithMetadata>::for_ontology_edge_by_entity_type_vertex_id(
                            &entity_type_vertex_id,
                            OntologyEdgeKind::InheritsFrom,
                            EdgeDirection::Incoming,
                        ),
                        &temporal_axes,
                    )
                        .await?
                    {
                        let referenced_entity_type_vertex_id = referenced_entity_type.vertex_id(time_axis);

                        subgraph.insert_edge(
                            &entity_type_vertex_id,
                            OntologyEdgeKind::InheritsFrom,
                            EdgeDirection::Outgoing,
                            referenced_entity_type_vertex_id.clone(),
                        );

                        subgraph.insert_vertex(&referenced_entity_type_vertex_id, referenced_entity_type);

                        entity_type_queue.push((
                            referenced_entity_type_vertex_id,
                            GraphResolveDepths {
                                inherits_from: OutgoingEdgeResolveDepth {
                                    outgoing: graph_resolve_depths.inherits_from.outgoing
                                        - 1,
                                    ..graph_resolve_depths.inherits_from
                                },
                                ..graph_resolve_depths
                            },
                            temporal_axes.clone()
                        ));
                    }
                }

                if graph_resolve_depths.constrains_links_on.outgoing > 0 {
                    for referenced_entity_type in <Self as Read<EntityTypeWithMetadata>>::read(
                        self,
                        &Filter::<EntityTypeWithMetadata>::for_ontology_edge_by_entity_type_vertex_id(
                            &entity_type_vertex_id,
                            OntologyEdgeKind::ConstrainsLinksOn,
                            EdgeDirection::Incoming,
                        ),
                        &temporal_axes,
                    )
                        .await?
                    {
                        let referenced_entity_type_vertex_id = referenced_entity_type.vertex_id(time_axis);

                        subgraph.insert_edge(
                            &entity_type_vertex_id,
                            OntologyEdgeKind::ConstrainsLinksOn,
                            EdgeDirection::Outgoing,
                            referenced_entity_type_vertex_id.clone(),
                        );

                        subgraph.insert_vertex(&referenced_entity_type_vertex_id, referenced_entity_type);

                        entity_type_queue.push((
                            referenced_entity_type_vertex_id,
                            GraphResolveDepths {
                                constrains_links_on: OutgoingEdgeResolveDepth {
                                    outgoing: graph_resolve_depths.constrains_links_on.outgoing
                                        - 1,
                                    ..graph_resolve_depths.constrains_links_on
                                },
                                ..graph_resolve_depths
                            },
                            temporal_axes.clone()
                        ));
                    }
                }

                if graph_resolve_depths
                    .constrains_link_destinations_on
                    .outgoing
                    > 0
                {
                    for referenced_entity_type in <Self as Read<EntityTypeWithMetadata>>::read(
                        self,
                        &Filter::<EntityTypeWithMetadata>::for_ontology_edge_by_entity_type_vertex_id(
                            &entity_type_vertex_id,
                            OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                            EdgeDirection::Incoming,
                        ),
                        &temporal_axes,
                    )
                        .await?
                    {
                        let referenced_entity_type_vertex_id = referenced_entity_type.vertex_id(time_axis);

                        subgraph.insert_edge(
                            &entity_type_vertex_id,
                            OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                            EdgeDirection::Outgoing,
                            referenced_entity_type_vertex_id.clone(),
                        );

                        subgraph.insert_vertex(&referenced_entity_type_vertex_id, referenced_entity_type);

                        entity_type_queue.push((
                            referenced_entity_type_vertex_id,
                            GraphResolveDepths {
                                constrains_link_destinations_on: OutgoingEdgeResolveDepth {
                                    outgoing: graph_resolve_depths.constrains_link_destinations_on.outgoing
                                        - 1,
                                    ..graph_resolve_depths.constrains_link_destinations_on
                                },
                                ..graph_resolve_depths
                            },
                            temporal_axes.clone()
                        ));
                    }
                }
            }
        }

        self.traverse_property_types(property_type_queue, traversal_context, subgraph)
            .await?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> EntityTypeStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, entity_types))]
    async fn create_entity_types(
        &mut self,
        entity_types: impl IntoIterator<
            Item = (
                EntityType,
                impl Borrow<OntologyElementMetadata> + Send + Sync,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<(), InsertionError> {
        let entity_types = entity_types.into_iter();
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let mut inserted_entity_types = Vec::with_capacity(entity_types.size_hint().0);
        for (schema, metadata) in entity_types {
            let ontology_id = transaction
                .create(schema.clone(), metadata.borrow())
                .await?;
            inserted_entity_types.push((ontology_id, schema));
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

        Ok(())
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

        let entity_types = Read::<EntityTypeWithMetadata>::read(self, filter, &temporal_axes)
            .await?
            .into_iter()
            .map(|entity| (entity.vertex_id(time_axis), entity))
            .collect();

        let mut subgraph = Subgraph::new(
            graph_resolve_depths,
            unresolved_temporal_axes.clone(),
            temporal_axes.clone(),
        );
        subgraph.vertices.entity_types = entity_types;

        for vertex_id in subgraph.vertices.entity_types.keys() {
            subgraph.roots.insert(vertex_id.clone().into());
        }

        // TODO: We currently pass in the subgraph as mutable reference, thus we cannot borrow the
        //       vertices and have to `.collect()` the keys.
        self.traverse_entity_types(
            subgraph
                .vertices
                .entity_types
                .keys()
                .map(|id| {
                    (
                        id.clone(),
                        subgraph.depths,
                        subgraph.temporal_axes.resolved.clone(),
                    )
                })
                .collect(),
            &mut TraversalContext,
            &mut subgraph,
        )
        .await?;

        Ok(subgraph)
    }

    #[tracing::instrument(level = "info", skip(self, entity_type))]
    async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
        updated_by: UpdatedById,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        let transaction = self.transaction().await.change_context(UpdateError)?;

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_entity_type_references` taking `&entity_type`
        let (ontology_id, metadata) = transaction
            .update::<EntityType>(entity_type.clone(), updated_by)
            .await?;

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

        Ok(metadata)
    }
}
