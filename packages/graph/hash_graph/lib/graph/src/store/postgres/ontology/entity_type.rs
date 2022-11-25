use std::{future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::EntityType;

use crate::{
    identifier::{ontology::OntologyTypeEditionId, GraphElementEditionId},
    ontology::{EntityTypeWithMetadata, OntologyElementMetadata},
    provenance::{CreatedById, OwnedById, UpdatedById},
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
    pub(crate) fn get_entity_type_as_dependency<'a>(
        &'a self,
        entity_type_id: &'a OntologyTypeEditionId,
        dependency_context: &'a mut DependencyContext,
        subgraph: &'a mut Subgraph,
        current_resolve_depth: GraphResolveDepths,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        async move {
            let dependency_status = dependency_context
                .ontology_dependency_map
                .insert(entity_type_id, Some(current_resolve_depth));
            let entity_type = match dependency_status {
                DependencyStatus::Unknown => {
                    let entity_type = Read::<EntityTypeWithMetadata>::read_one(
                        self,
                        &Filter::for_ontology_type_edition_id(entity_type_id),
                    )
                    .await?;
                    Some(
                        subgraph
                            .vertices
                            .ontology
                            .entry(entity_type_id.clone())
                            .or_insert(OntologyVertex::EntityType(Box::new(entity_type)))
                            .clone(),
                    )
                }
                DependencyStatus::DependenciesUnresolved => {
                    subgraph.vertices.ontology.get(entity_type_id).cloned()
                }
                DependencyStatus::Resolved => None,
            };

            if let Some(OntologyVertex::EntityType(entity_type)) = entity_type {
                for property_type_ref in entity_type.inner().property_type_references() {
                    if current_resolve_depth.constrains_properties_on.outgoing > 0 {
                        self.get_property_type_as_dependency(
                            &OntologyTypeEditionId::from(property_type_ref.uri()),
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

                    subgraph.edges.insert(Edge::Ontology {
                        edition_id: entity_type_id.clone(),
                        outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                            kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                            reversed: false,
                            right_endpoint: OntologyTypeEditionId::from(property_type_ref.uri()),
                        }),
                    });
                }

                for entity_type_ref in entity_type.inner().inherits_from().all_of() {
                    if current_resolve_depth.inherits_from.outgoing > 0 {
                        self.get_entity_type_as_dependency(
                            &OntologyTypeEditionId::from(entity_type_ref.uri()),
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

                    subgraph.edges.insert(Edge::Ontology {
                        edition_id: entity_type_id.clone(),
                        outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                            kind: OntologyEdgeKind::InheritsFrom,
                            reversed: false,
                            right_endpoint: OntologyTypeEditionId::from(entity_type_ref.uri()),
                        }),
                    });
                }

                for entity_type_ref in entity_type.inner().link_mappings().into_keys() {
                    if current_resolve_depth.constrains_links_on.outgoing > 0 {
                        self.get_entity_type_as_dependency(
                            &OntologyTypeEditionId::from(entity_type_ref.uri()),
                            dependency_context,
                            subgraph,
                            GraphResolveDepths {
                                constrains_links_on: OutgoingEdgeResolveDepth {
                                    outgoing: current_resolve_depth.constrains_links_on.outgoing
                                        - 1,
                                    ..current_resolve_depth.constrains_links_on
                                },
                                ..current_resolve_depth
                            },
                        )
                        .await?;
                    }

                    subgraph.edges.insert(Edge::Ontology {
                        edition_id: entity_type_id.clone(),
                        outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                            kind: OntologyEdgeKind::ConstrainsLinksOn,
                            reversed: false,
                            right_endpoint: OntologyTypeEditionId::from(entity_type_ref.uri()),
                        }),
                    });
                }

                // `flatten`s are used to flatten `Option<[EntityTypeReference]>`
                for entity_type_ref in entity_type
                    .inner()
                    .link_mappings()
                    .into_values()
                    .flatten()
                    .flatten()
                {
                    if current_resolve_depth
                        .constrains_link_destinations_on
                        .outgoing
                        > 0
                    {
                        self.get_entity_type_as_dependency(
                            &OntologyTypeEditionId::from(entity_type_ref.uri()),
                            dependency_context,
                            subgraph,
                            GraphResolveDepths {
                                constrains_link_destinations_on: OutgoingEdgeResolveDepth {
                                    outgoing: current_resolve_depth
                                        .constrains_link_destinations_on
                                        .outgoing
                                        - 1,
                                    ..current_resolve_depth.constrains_link_destinations_on
                                },
                                ..current_resolve_depth
                            },
                        )
                        .await?;
                    }

                    subgraph.edges.insert(Edge::Ontology {
                        edition_id: entity_type_id.clone(),
                        outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                            kind: OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                            reversed: false,
                            right_endpoint: OntologyTypeEditionId::from(entity_type_ref.uri()),
                        }),
                    });
                }
            }

            Ok(())
        }
        .boxed()
    }
}

#[async_trait]
impl<C: AsClient> EntityTypeStore for PostgresStore<C> {
    async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
        owned_by_id: OwnedById,
        created_by_id: CreatedById,
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
            .create(entity_type.clone(), owned_by_id, created_by_id)
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

    async fn get_entity_type<'f: 'q, 'q>(
        &self,
        query: &'f StructuralQuery<'q, EntityType>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
        } = *query;

        let mut subgraph = stream::iter(Read::<EntityTypeWithMetadata>::read(self, filter).await?)
            .then(|entity_type| async move {
                let mut subgraph = Subgraph::new(graph_resolve_depths);
                let mut dependency_context = DependencyContext::default();

                let entity_type_id = entity_type.metadata().edition_id().clone();
                dependency_context
                    .ontology_dependency_map
                    .insert(&entity_type_id, None);
                subgraph.vertices.ontology.insert(
                    entity_type_id.clone(),
                    OntologyVertex::EntityType(Box::new(entity_type)),
                );

                self.get_entity_type_as_dependency(
                    &entity_type_id,
                    &mut dependency_context,
                    &mut subgraph,
                    graph_resolve_depths,
                )
                .await?;

                subgraph
                    .roots
                    .insert(GraphElementEditionId::Ontology(entity_type_id));

                Ok::<_, Report<QueryError>>(subgraph)
            })
            .try_collect::<Subgraph>()
            .await?;

        subgraph.depths = graph_resolve_depths;

        Ok(subgraph)
    }

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
