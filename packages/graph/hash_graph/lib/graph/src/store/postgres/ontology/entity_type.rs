use std::{collections::hash_map::RawEntryMut, future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::FutureExt;
use tokio_postgres::GenericClient;
use type_system::{EntityType, EntityTypeReference, PropertyTypeReference};

use crate::{
    identifier::{ontology::OntologyTypeEditionId, GraphElementEditionId},
    ontology::{EntityTypeWithMetadata, OntologyElementMetadata},
    provenance::{OwnedById, UpdatedById},
    store::{
        crud::Read,
        postgres::{DependencyContext, DependencyStatus},
        query::Filter,
        AsClient, EntityTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
    subgraph::{
        edges::{
            Edge, GraphResolveDepths, OntologyEdgeKind, OntologyOutwardEdges,
            OutgoingEdgeResolveDepth, OutwardEdge,
        },
        query::StructuralQuery,
        vertices::OntologyVertex,
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`EntityTypeWithMetadata`] into four [`DependencyContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[expect(
        clippy::too_many_lines,
        reason = "There is quite a few code duplication, which has to be resolved"
    )]
    #[tracing::instrument(level = "trace", skip(self, dependency_context, subgraph))]
    pub(crate) fn traverse_entity_type<'a>(
        &'a self,
        entity_type_id: &'a OntologyTypeEditionId,
        dependency_context: &'a mut DependencyContext,
        subgraph: &'a mut Subgraph,
        current_resolve_depth: GraphResolveDepths,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        async move {
            let dependency_status = dependency_context
                .ontology_dependency_map
                .insert(entity_type_id, current_resolve_depth);

            // Explicitly converting the unique reference to a shared reference to the vertex to
            // avoid mutating it by accident
            let entity_type: Option<&OntologyVertex> = match dependency_status {
                DependencyStatus::Unresolved => {
                    match subgraph
                        .vertices
                        .ontology
                        .raw_entry_mut()
                        .from_key(entity_type_id)
                    {
                        RawEntryMut::Occupied(entry) => Some(entry.into_mut()),
                        RawEntryMut::Vacant(entry) => {
                            let entity_type = Read::<EntityTypeWithMetadata>::read_one(
                                self,
                                &Filter::for_ontology_type_edition_id(entity_type_id),
                            )
                            .await?;
                            Some(
                                entry
                                    .insert(
                                        entity_type_id.clone(),
                                        OntologyVertex::EntityType(Box::new(entity_type)),
                                    )
                                    .1,
                            )
                        }
                    }
                }
                DependencyStatus::Resolved => None,
            };

            if let Some(OntologyVertex::EntityType(entity_type)) = entity_type {
                // Collecting references before traversing further to avoid having a shared
                // reference to the subgraph when borrowing it mutably
                let property_type_ref_uris =
                    (current_resolve_depth.constrains_properties_on.outgoing > 0).then(|| {
                        entity_type
                            .inner()
                            .property_type_references()
                            .into_iter()
                            .map(PropertyTypeReference::uri)
                            .cloned()
                            .collect::<Vec<_>>()
                    });

                let inherits_from_type_ref_uris =
                    (current_resolve_depth.inherits_from.outgoing > 0).then(|| {
                        entity_type
                            .inner()
                            .inherits_from()
                            .all_of()
                            .iter()
                            .map(EntityTypeReference::uri)
                            .cloned()
                            .collect::<Vec<_>>()
                    });

                let link_mappings = (current_resolve_depth.constrains_links_on.outgoing > 0
                    || current_resolve_depth
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
                        subgraph.edges.insert(Edge::Ontology {
                            edition_id: entity_type_id.clone(),
                            outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                                kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                                reversed: false,
                                right_endpoint: OntologyTypeEditionId::from(&property_type_ref_uri),
                            }),
                        });

                        self.traverse_property_type(
                            &OntologyTypeEditionId::from(&property_type_ref_uri),
                            dependency_context,
                            subgraph,
                            GraphResolveDepths {
                                constrains_properties_on: OutgoingEdgeResolveDepth {
                                    outgoing: current_resolve_depth
                                        .constrains_properties_on
                                        .outgoing
                                        - 1,
                                    ..current_resolve_depth.constrains_properties_on
                                },
                                ..current_resolve_depth
                            },
                        )
                        .await?;
                    }
                }

                if let Some(inherits_from_type_ref_uris) = inherits_from_type_ref_uris {
                    for inherits_from_type_ref_uri in inherits_from_type_ref_uris {
                        subgraph.edges.insert(Edge::Ontology {
                            edition_id: entity_type_id.clone(),
                            outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                                kind: OntologyEdgeKind::InheritsFrom,
                                reversed: false,
                                right_endpoint: OntologyTypeEditionId::from(
                                    &inherits_from_type_ref_uri,
                                ),
                            }),
                        });

                        self.traverse_entity_type(
                            &OntologyTypeEditionId::from(&inherits_from_type_ref_uri),
                            dependency_context,
                            subgraph,
                            GraphResolveDepths {
                                inherits_from: OutgoingEdgeResolveDepth {
                                    outgoing: current_resolve_depth.inherits_from.outgoing - 1,
                                    ..current_resolve_depth.inherits_from
                                },
                                ..current_resolve_depth
                            },
                        )
                        .await?;
                    }
                }

                if let Some(link_mappings) = link_mappings {
                    for (link_type_uri, destination_type_uris) in link_mappings {
                        if current_resolve_depth.constrains_links_on.outgoing > 0 {
                            subgraph.edges.insert(Edge::Ontology {
                                edition_id: entity_type_id.clone(),
                                outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                                    kind: OntologyEdgeKind::ConstrainsLinksOn,
                                    reversed: false,
                                    right_endpoint: OntologyTypeEditionId::from(&link_type_uri),
                                }),
                            });

                            self.traverse_entity_type(
                                &OntologyTypeEditionId::from(&link_type_uri),
                                dependency_context,
                                subgraph,
                                GraphResolveDepths {
                                    constrains_links_on: OutgoingEdgeResolveDepth {
                                        outgoing: current_resolve_depth
                                            .constrains_links_on
                                            .outgoing
                                            - 1,
                                        ..current_resolve_depth.constrains_links_on
                                    },
                                    ..current_resolve_depth
                                },
                            )
                            .await?;

                            if current_resolve_depth
                                .constrains_link_destinations_on
                                .outgoing
                                > 0
                            {
                                for destination_type_uri in destination_type_uris {
                                    subgraph.edges.insert(Edge::Ontology {
                                        edition_id: entity_type_id.clone(),
                                        outward_edge: OntologyOutwardEdges::ToOntology(
                                            OutwardEdge {
                                                kind:
                                                    OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                                                reversed: false,
                                                right_endpoint: OntologyTypeEditionId::from(
                                                    &destination_type_uri,
                                                ),
                                            },
                                        ),
                                    });

                                    self.traverse_entity_type(
                                        &OntologyTypeEditionId::from(&destination_type_uri),
                                        dependency_context,
                                        subgraph,
                                        GraphResolveDepths {
                                            constrains_link_destinations_on:
                                                OutgoingEdgeResolveDepth {
                                                    outgoing: current_resolve_depth
                                                        .constrains_link_destinations_on
                                                        .outgoing
                                                        - 1,
                                                    ..current_resolve_depth
                                                        .constrains_link_destinations_on
                                                },
                                            ..current_resolve_depth
                                        },
                                    )
                                    .await?;
                                }
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
    #[tracing::instrument(level = "info", skip(self, entity_type))]
    async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
        owned_by_id: OwnedById,
        updated_by_id: UpdatedById,
    ) -> Result<OntologyElementMetadata, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_entity_type_references` taking `&entity_type`
        let (version_id, metadata) = transaction
            .create(entity_type.clone(), owned_by_id, updated_by_id)
            .await?;

        transaction
            .insert_entity_type_references(&entity_type, version_id)
            .await
            .change_context(InsertionError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for entity type: {}",
                    entity_type.id()
                )
            })
            .attach_lazy(|| entity_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(metadata)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_entity_type<'f: 'q, 'q>(
        &self,
        query: &'f StructuralQuery<'q, EntityTypeWithMetadata>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
        } = *query;

        let mut subgraph = Subgraph::new(graph_resolve_depths);
        let mut dependency_context = DependencyContext::default();

        for entity_type in Read::<EntityTypeWithMetadata>::read(self, filter).await? {
            let entity_type_id = entity_type.metadata().edition_id().clone();

            // Insert the vertex into the subgraph to avoid another lookup when traversing it
            subgraph.vertices.ontology.insert(
                entity_type_id.clone(),
                OntologyVertex::EntityType(Box::new(entity_type)),
            );

            self.traverse_entity_type(
                &entity_type_id,
                &mut dependency_context,
                &mut subgraph,
                graph_resolve_depths,
            )
            .await?;

            subgraph
                .roots
                .insert(GraphElementEditionId::Ontology(entity_type_id));
        }

        Ok(subgraph)
    }

    #[tracing::instrument(level = "info", skip(self, entity_type))]
    async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
        updated_by: UpdatedById,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_entity_type_references` taking `&entity_type`
        let (version_id, metadata) = transaction.update(entity_type.clone(), updated_by).await?;

        transaction
            .insert_entity_type_references(&entity_type, version_id)
            .await
            .change_context(UpdateError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for entity type: {}",
                    entity_type.id()
                )
            })
            .attach_lazy(|| entity_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(metadata)
    }
}
