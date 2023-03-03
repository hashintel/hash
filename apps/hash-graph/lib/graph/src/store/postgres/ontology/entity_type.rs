use std::{borrow::Borrow, future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use futures::FutureExt;
use type_system::{EntityType, EntityTypeReference, PropertyTypeReference};

use crate::{
    identifier::OntologyTypeVertexId,
    ontology::{EntityTypeWithMetadata, OntologyElementMetadata, OntologyTypeWithMetadata},
    provenance::UpdatedById,
    store::{
        crud::Read,
        postgres::{TraversalContext, TraversalStatus},
        AsClient, EntityTypeStore, InsertionError, PostgresStore, QueryError, Record, UpdateError,
    },
    subgraph::{
        edges::{
            Edge, GraphResolveDepths, OntologyEdgeKind, OntologyOutwardEdge,
            OutgoingEdgeResolveDepth, OutwardEdge,
        },
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
    pub(crate) fn traverse_entity_type<'a>(
        &'a self,
        entity_type_id: &'a OntologyTypeVertexId,
        traversal_context: &'a mut TraversalContext,
        subgraph: &'a mut Subgraph,
        mut current_resolve_depths: GraphResolveDepths,
        mut temporal_axes: QueryTemporalAxes,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        async move {
            let traversal_status = traversal_context.ontology_traversal_map.update(
                entity_type_id,
                current_resolve_depths,
                temporal_axes.variable_interval().convert(),
            );

            let entity_type = match traversal_status {
                TraversalStatus::Unresolved(depths, interval) => {
                    // Depending on previous traversals, we may have to resolve with parameters
                    // different to those provided, so we update the resolve depths and the temporal
                    // axes.
                    //
                    // `TraversalMap::update` may return a higher resolve depth than the one
                    // requested, so we update the `resolve_depths` to the returned value.
                    current_resolve_depths = depths;
                    temporal_axes.set_variable_interval(interval.convert());
                    subgraph
                        .get_or_read::<EntityTypeWithMetadata>(self, entity_type_id, &temporal_axes)
                        .await?
                }
                TraversalStatus::Resolved => return Ok(()),
            };

            // Collecting references before traversing further to avoid having a shared
            // reference to the subgraph when borrowing it mutably
            let property_type_ref_urls =
                (current_resolve_depths.constrains_properties_on.outgoing > 0).then(|| {
                    entity_type
                        .inner()
                        .property_type_references()
                        .into_iter()
                        .map(PropertyTypeReference::url)
                        .cloned()
                        .collect::<Vec<_>>()
                });

            let inherits_from_type_ref_urls = (current_resolve_depths.inherits_from.outgoing > 0)
                .then(|| {
                    entity_type
                        .inner()
                        .inherits_from()
                        .all_of()
                        .iter()
                        .map(EntityTypeReference::url)
                        .cloned()
                        .collect::<Vec<_>>()
                });

            let link_mappings = (current_resolve_depths.constrains_links_on.outgoing > 0
                || current_resolve_depths
                    .constrains_link_destinations_on
                    .outgoing
                    > 0)
            .then(|| {
                entity_type
                    .inner()
                    .link_mappings()
                    .into_iter()
                    .map(|(entity_type_ref, destinations)| {
                        (
                            entity_type_ref.url().clone(),
                            destinations
                                .into_iter()
                                .flatten()
                                .map(EntityTypeReference::url)
                                .cloned()
                                .collect::<Vec<_>>(),
                        )
                    })
                    .collect::<Vec<_>>()
            });

            if let Some(property_type_ref_urls) = property_type_ref_urls {
                for property_type_ref_url in property_type_ref_urls {
                    let property_type_vertex_id = OntologyTypeVertexId::from(property_type_ref_url);

                    subgraph.edges.insert(Edge::Ontology {
                        vertex_id: entity_type_id.clone(),
                        outward_edge: OntologyOutwardEdge::ToOntology(OutwardEdge {
                            kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                            reversed: false,
                            right_endpoint: property_type_vertex_id.clone(),
                        }),
                    });

                    self.traverse_property_type(
                        &property_type_vertex_id,
                        traversal_context,
                        subgraph,
                        GraphResolveDepths {
                            constrains_properties_on: OutgoingEdgeResolveDepth {
                                outgoing: current_resolve_depths.constrains_properties_on.outgoing
                                    - 1,
                                ..current_resolve_depths.constrains_properties_on
                            },
                            ..current_resolve_depths
                        },
                        temporal_axes.clone(),
                    )
                    .await?;
                }
            }

            if let Some(inherits_from_type_ref_urls) = inherits_from_type_ref_urls {
                for inherits_from_type_ref_url in inherits_from_type_ref_urls {
                    let inherits_from_type_vertex_id =
                        OntologyTypeVertexId::from(inherits_from_type_ref_url);

                    subgraph.edges.insert(Edge::Ontology {
                        vertex_id: entity_type_id.clone(),
                        outward_edge: OntologyOutwardEdge::ToOntology(OutwardEdge {
                            kind: OntologyEdgeKind::InheritsFrom,
                            reversed: false,
                            right_endpoint: inherits_from_type_vertex_id.clone(),
                        }),
                    });

                    self.traverse_entity_type(
                        &inherits_from_type_vertex_id,
                        traversal_context,
                        subgraph,
                        GraphResolveDepths {
                            inherits_from: OutgoingEdgeResolveDepth {
                                outgoing: current_resolve_depths.inherits_from.outgoing - 1,
                                ..current_resolve_depths.inherits_from
                            },
                            ..current_resolve_depths
                        },
                        temporal_axes.clone(),
                    )
                    .await?;
                }
            }

            if let Some(link_mappings) = link_mappings {
                for (link_type_url, destination_type_urls) in link_mappings {
                    if current_resolve_depths.constrains_links_on.outgoing > 0 {
                        let link_type_vertex_id = OntologyTypeVertexId::from(link_type_url);

                        subgraph.edges.insert(Edge::Ontology {
                            vertex_id: entity_type_id.clone(),
                            outward_edge: OntologyOutwardEdge::ToOntology(OutwardEdge {
                                kind: OntologyEdgeKind::ConstrainsLinksOn,
                                reversed: false,
                                right_endpoint: link_type_vertex_id.clone(),
                            }),
                        });

                        self.traverse_entity_type(
                            &link_type_vertex_id,
                            traversal_context,
                            subgraph,
                            GraphResolveDepths {
                                constrains_links_on: OutgoingEdgeResolveDepth {
                                    outgoing: current_resolve_depths.constrains_links_on.outgoing
                                        - 1,
                                    ..current_resolve_depths.constrains_links_on
                                },
                                ..current_resolve_depths
                            },
                            temporal_axes.clone(),
                        )
                        .await?;

                        if current_resolve_depths
                            .constrains_link_destinations_on
                            .outgoing
                            > 0
                        {
                            for destination_type_url in destination_type_urls {
                                let destination_type_vertex_id =
                                    OntologyTypeVertexId::from(destination_type_url);

                                subgraph.edges.insert(Edge::Ontology {
                                    vertex_id: entity_type_id.clone(),
                                    outward_edge: OntologyOutwardEdge::ToOntology(OutwardEdge {
                                        kind: OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                                        reversed: false,
                                        right_endpoint: destination_type_vertex_id.clone(),
                                    }),
                                });

                                self.traverse_entity_type(
                                    &destination_type_vertex_id,
                                    traversal_context,
                                    subgraph,
                                    GraphResolveDepths {
                                        constrains_link_destinations_on: OutgoingEdgeResolveDepth {
                                            outgoing: current_resolve_depths
                                                .constrains_link_destinations_on
                                                .outgoing
                                                - 1,
                                            ..current_resolve_depths.constrains_link_destinations_on
                                        },
                                        ..current_resolve_depths
                                    },
                                    temporal_axes.clone(),
                                )
                                .await?;
                            }
                        }
                    }
                }
            }
            Ok(())
        }
        .boxed()
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

        let mut subgraph = Subgraph::new(
            graph_resolve_depths,
            unresolved_temporal_axes.clone(),
            temporal_axes.clone(),
        );
        let mut traversal_context = TraversalContext::default();

        for entity_type in
            Read::<EntityTypeWithMetadata>::read(self, filter, &temporal_axes).await?
        {
            let vertex_id = entity_type.vertex_id(time_axis);
            // Insert the vertex into the subgraph to avoid another lookup when traversing it
            subgraph.insert(&vertex_id, entity_type);

            self.traverse_entity_type(
                &vertex_id,
                &mut traversal_context,
                &mut subgraph,
                graph_resolve_depths,
                temporal_axes.clone(),
            )
            .await?;

            subgraph.roots.insert(vertex_id.into());
        }

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
