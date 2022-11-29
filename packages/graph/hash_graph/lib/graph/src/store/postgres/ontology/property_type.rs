use std::{future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::FutureExt;
use tokio_postgres::GenericClient;
use type_system::PropertyType;

use crate::{
    identifier::{ontology::OntologyTypeEditionId, GraphElementEditionId},
    ontology::{OntologyElementMetadata, PropertyTypeWithMetadata},
    provenance::{CreatedById, OwnedById, UpdatedById},
    store::{
        crud::Read,
        postgres::{DependencyContext, DependencyStatus},
        query::Filter,
        AsClient, InsertionError, PostgresStore, PropertyTypeStore, QueryError, UpdateError,
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
    /// Internal method to read a [`PropertyTypeWithMetadata`] into two [`DependencyContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_property_type_with_dependency<'a>(
        &'a self,
        property_type_id: &'a OntologyTypeEditionId,
        dependency_context: &'a mut DependencyContext,
        subgraph: &'a mut Subgraph,
        current_resolve_depth: GraphResolveDepths,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        async move {
            let dependency_status = dependency_context
                .ontology_dependency_map
                .insert(property_type_id, current_resolve_depth);
            let property_type = match dependency_status {
                DependencyStatus::Unknown => {
                    let property_type = Read::<PropertyTypeWithMetadata>::read_one(
                        self,
                        &Filter::for_ontology_type_edition_id(property_type_id),
                    )
                    .await?;
                    Some(
                        subgraph
                            .vertices
                            .ontology
                            .entry(property_type_id.clone())
                            .or_insert(OntologyVertex::PropertyType(Box::new(property_type)))
                            .clone(),
                    )
                }
                DependencyStatus::DependenciesUnresolved => {
                    subgraph.vertices.ontology.get(property_type_id).cloned()
                }
                DependencyStatus::Resolved => None,
            };

            if let Some(OntologyVertex::PropertyType(property_type)) = property_type {
                // TODO: Use relation tables
                //   see https://app.asana.com/0/0/1202884883200942/f
                for property_type_ref in property_type.inner().property_type_references() {
                    if current_resolve_depth.constrains_properties_on.outgoing > 0 {
                        if dependency_status == DependencyStatus::Unknown {
                            subgraph.edges.insert(Edge::Ontology {
                                edition_id: property_type_id.clone(),
                                outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                                    kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                                    reversed: false,
                                    right_endpoint: OntologyTypeEditionId::from(
                                        property_type_ref.uri(),
                                    ),
                                }),
                            });
                        }

                        self.get_property_type_with_dependency(
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
                }

                // TODO: Use relation tables
                //   see https://app.asana.com/0/0/1202884883200942/f
                for data_type_ref in property_type.inner().data_type_references() {
                    if current_resolve_depth.constrains_values_on.outgoing > 0 {
                        if dependency_status == DependencyStatus::Unknown {
                            subgraph.edges.insert(Edge::Ontology {
                                edition_id: property_type_id.clone(),
                                outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                                    kind: OntologyEdgeKind::ConstrainsValuesOn,
                                    reversed: false,
                                    right_endpoint: OntologyTypeEditionId::from(
                                        data_type_ref.uri(),
                                    ),
                                }),
                            });
                        }

                        self.get_data_type_with_dependency(
                            &OntologyTypeEditionId::from(data_type_ref.uri()),
                            dependency_context,
                            subgraph,
                            GraphResolveDepths {
                                constrains_values_on: OutgoingEdgeResolveDepth {
                                    outgoing: current_resolve_depth.constrains_values_on.outgoing
                                        - 1,
                                    ..current_resolve_depth.constrains_values_on
                                },
                                ..current_resolve_depth
                            },
                        )
                        .await?;
                    }
                }
            }

            Ok(())
        }
        .boxed()
    }
}

#[async_trait]
impl<C: AsClient> PropertyTypeStore for PostgresStore<C> {
    async fn create_property_type(
        &mut self,
        property_type: PropertyType,
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
        // after as well. See `insert_property_type_references` taking `&property_type`
        let (version_id, metadata) = transaction
            .create(property_type.clone(), owned_by_id, created_by_id)
            .await?;

        transaction
            .insert_property_type_references(&property_type, version_id)
            .await
            .change_context(InsertionError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for property type: {}",
                    property_type.id()
                )
            })
            .attach_lazy(|| property_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(metadata)
    }

    async fn get_property_type<'f: 'q, 'q>(
        &self,
        query: &'f StructuralQuery<'q, PropertyType>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
        } = *query;

        let mut subgraph = Subgraph::new(graph_resolve_depths);
        let mut dependency_context = DependencyContext::default();

        for property_type in Read::<PropertyTypeWithMetadata>::read(self, filter).await? {
            let property_type_id = property_type.metadata().edition_id().clone();

            self.get_property_type_with_dependency(
                &property_type_id,
                &mut dependency_context,
                &mut subgraph,
                graph_resolve_depths,
            )
            .await?;

            subgraph
                .roots
                .insert(GraphElementEditionId::Ontology(property_type_id));
        }

        Ok(subgraph)
    }

    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
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
        // after as well. See `insert_property_type_references` taking `&property_type`
        let (version_id, metadata) = transaction
            .update(property_type.clone(), updated_by)
            .await?;

        transaction
            .insert_property_type_references(&property_type, version_id)
            .await
            .change_context(UpdateError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for property type: {}",
                    property_type.id()
                )
            })
            .attach_lazy(|| property_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(metadata)
    }
}
