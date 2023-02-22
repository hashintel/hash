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
        postgres::{DependencyContext, DependencyStatus},
        AsClient, EntityTypeStore, InsertionError, PostgresStore, QueryError, Record, UpdateError,
    },
    subgraph::{
        edges::{
            Edge, GraphResolveDepths, OntologyEdgeKind, OntologyOutwardEdges,
            OutgoingEdgeResolveDepth, OutwardEdge,
        },
        query::StructuralQuery,
        temporal_axes::QueryTemporalAxes,
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`EntityTypeWithMetadata`] into four [`DependencyContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "trace", skip(self, dependency_context, subgraph))]
    pub(crate) fn traverse_entity_type<'a>(
        &'a self,
        entity_type_id: &'a OntologyTypeVertexId,
        dependency_context: &'a mut DependencyContext,
        subgraph: &'a mut Subgraph,
        mut current_resolve_depths: GraphResolveDepths,
        mut temporal_axes: QueryTemporalAxes,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        async move {
            let dependency_status = dependency_context.ontology_dependency_map.update(
                entity_type_id,
                current_resolve_depths,
                temporal_axes.variable_interval().convert(),
            );

            let entity_type = match dependency_status {
                DependencyStatus::Unresolved(depths, interval) => {
                    // The dependency may have to be resolved more than anticipated, so we update
                    // the resolve depth and the temporal axes.
                    current_resolve_depths = depths;
                    temporal_axes.set_variable_interval(interval.convert());
                    subgraph
                        .get_or_read::<EntityTypeWithMetadata>(self, entity_type_id, &temporal_axes)
                        .await?
                }
                DependencyStatus::Resolved => return Ok(()),
            };

            // Collecting references before traversing further to avoid having a shared
            // reference to the subgraph when borrowing it mutably
            let property_type_ref_uris =
                (current_resolve_depths.constrains_properties_on.outgoing > 0).then(|| {
                    entity_type
                        .inner()
                        .property_type_references()
                        .into_iter()
                        .map(PropertyTypeReference::uri)
                        .cloned()
                        .collect::<Vec<_>>()
                });

            let inherits_from_type_ref_uris = (current_resolve_depths.inherits_from.outgoing > 0)
                .then(|| {
                    entity_type
                        .inner()
                        .inherits_from()
                        .all_of()
                        .iter()
                        .map(EntityTypeReference::uri)
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
                            entity_type_ref.uri().clone(),
                            destinations
                                .into_iter()
                                .flatten()
                                .map(EntityTypeReference::uri)
                                .cloned()
                                .collect::<Vec<_>>(),
                        )
                    })
                    .collect::<Vec<_>>()
            });

            if let Some(property_type_ref_uris) = property_type_ref_uris {
                for property_type_ref_uri in property_type_ref_uris {
                    let property_type_vertex_id = OntologyTypeVertexId::from(property_type_ref_uri);

                    subgraph.edges.insert(Edge::Ontology {
                        vertex_id: entity_type_id.clone(),
                        outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                            kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                            reversed: false,
                            right_endpoint: property_type_vertex_id.clone(),
                        }),
                    });

                    self.traverse_property_type(
                        &property_type_vertex_id,
                        dependency_context,
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

            if let Some(inherits_from_type_ref_uris) = inherits_from_type_ref_uris {
                for inherits_from_type_ref_uri in inherits_from_type_ref_uris {
                    let inherits_from_type_vertex_id =
                        OntologyTypeVertexId::from(inherits_from_type_ref_uri);

                    subgraph.edges.insert(Edge::Ontology {
                        vertex_id: entity_type_id.clone(),
                        outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                            kind: OntologyEdgeKind::InheritsFrom,
                            reversed: false,
                            right_endpoint: inherits_from_type_vertex_id.clone(),
                        }),
                    });

                    self.traverse_entity_type(
                        &inherits_from_type_vertex_id,
                        dependency_context,
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
                for (link_type_uri, destination_type_uris) in link_mappings {
                    if current_resolve_depths.constrains_links_on.outgoing > 0 {
                        let link_type_vertex_id = OntologyTypeVertexId::from(link_type_uri);

                        subgraph.edges.insert(Edge::Ontology {
                            vertex_id: entity_type_id.clone(),
                            outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                                kind: OntologyEdgeKind::ConstrainsLinksOn,
                                reversed: false,
                                right_endpoint: link_type_vertex_id.clone(),
                            }),
                        });

                        self.traverse_entity_type(
                            &link_type_vertex_id,
                            dependency_context,
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
                            for destination_type_uri in destination_type_uris {
                                let destination_type_vertex_id =
                                    OntologyTypeVertexId::from(destination_type_uri);

                                subgraph.edges.insert(Edge::Ontology {
                                    vertex_id: entity_type_id.clone(),
                                    outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                                        kind: OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                                        reversed: false,
                                        right_endpoint: destination_type_vertex_id.clone(),
                                    }),
                                });

                                self.traverse_entity_type(
                                    &destination_type_vertex_id,
                                    dependency_context,
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
        let mut dependency_context = DependencyContext::default();

        for entity_type in
            Read::<EntityTypeWithMetadata>::read(self, filter, &temporal_axes).await?
        {
            let vertex_id = entity_type.vertex_id(time_axis);
            // Insert the vertex into the subgraph to avoid another lookup when traversing it
            subgraph.insert(&vertex_id, entity_type);

            self.traverse_entity_type(
                &vertex_id,
                &mut dependency_context,
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
