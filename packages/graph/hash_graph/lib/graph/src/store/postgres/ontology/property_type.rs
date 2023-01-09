use std::{future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use futures::FutureExt;
use type_system::{DataTypeReference, PropertyType, PropertyTypeReference};

use crate::{
    identifier::ontology::OntologyTypeEditionId,
    ontology::{OntologyElementMetadata, OntologyTypeWithMetadata, PropertyTypeWithMetadata},
    provenance::{OwnedById, UpdatedById},
    store::{
        crud::Read,
        postgres::{DependencyContext, DependencyStatus},
        AsClient, InsertionError, PostgresStore, PropertyTypeStore, QueryError, Record, Store,
        Transaction, UpdateError,
    },
    subgraph::{
        edges::{
            Edge, GraphResolveDepths, OntologyEdgeKind, OntologyOutwardEdges,
            OutgoingEdgeResolveDepth, OutwardEdge,
        },
        query::StructuralQuery,
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PropertyTypeWithMetadata`] into two [`DependencyContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "trace", skip(self, dependency_context, subgraph))]
    pub(crate) fn traverse_property_type<'a>(
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
                DependencyStatus::Unresolved => {
                    subgraph
                        .get_or_read::<PropertyTypeWithMetadata>(self, property_type_id)
                        .await?
                }
                DependencyStatus::Resolved => return Ok(()),
            };

            // Collecting references before traversing further to avoid having a shared
            // reference to the subgraph when borrowing it mutably
            let data_type_ref_uris = (current_resolve_depth.constrains_values_on.outgoing > 0)
                .then(|| {
                    property_type
                        .inner()
                        .data_type_references()
                        .into_iter()
                        .map(DataTypeReference::uri)
                        .cloned()
                        .collect::<Vec<_>>()
                });

            let property_type_ref_uris =
                (current_resolve_depth.constrains_properties_on.outgoing > 0).then(|| {
                    property_type
                        .inner()
                        .property_type_references()
                        .into_iter()
                        .map(PropertyTypeReference::uri)
                        .cloned()
                        .collect::<Vec<_>>()
                });

            if let Some(data_type_ref_uris) = data_type_ref_uris {
                for data_type_ref in data_type_ref_uris {
                    subgraph.edges.insert(Edge::Ontology {
                        vertex_id: property_type_id.clone(),
                        outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                            kind: OntologyEdgeKind::ConstrainsValuesOn,
                            reversed: false,
                            right_endpoint: OntologyTypeEditionId::from(&data_type_ref),
                        }),
                    });

                    self.traverse_data_type(
                        &OntologyTypeEditionId::from(&data_type_ref),
                        dependency_context,
                        subgraph,
                        GraphResolveDepths {
                            constrains_values_on: OutgoingEdgeResolveDepth {
                                outgoing: current_resolve_depth.constrains_values_on.outgoing - 1,
                                ..current_resolve_depth.constrains_values_on
                            },
                            ..current_resolve_depth
                        },
                    )
                    .await?;
                }
            }

            if let Some(property_type_ref_uris) = property_type_ref_uris {
                for property_type_ref_uri in property_type_ref_uris {
                    subgraph.edges.insert(Edge::Ontology {
                        vertex_id: property_type_id.clone(),
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
                                outgoing: current_resolve_depth.constrains_properties_on.outgoing
                                    - 1,
                                ..current_resolve_depth.constrains_properties_on
                            },
                            ..current_resolve_depth
                        },
                    )
                    .await?;
                }
            }

            Ok(())
        }
        .boxed()
    }
}

#[async_trait]
impl<C: AsClient> PropertyTypeStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, property_type))]
    async fn create_property_type(
        &mut self,
        property_type: PropertyType,
        owned_by_id: OwnedById,
        updated_by_id: UpdatedById,
    ) -> Result<OntologyElementMetadata, InsertionError> {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_property_type_references` taking `&property_type`
        let (version_id, metadata) = transaction
            .create(property_type.clone(), owned_by_id, updated_by_id)
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

        transaction.commit().await.change_context(InsertionError)?;

        Ok(metadata)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_property_type(
        &self,
        query: &StructuralQuery<PropertyTypeWithMetadata>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
            ref time_projection,
        } = *query;

        let mut subgraph = Subgraph::new(
            graph_resolve_depths,
            time_projection.clone(),
            time_projection.clone().resolve(),
        );
        let mut dependency_context = DependencyContext::default();

        for property_type in Read::<PropertyTypeWithMetadata>::read(self, filter).await? {
            let vertex_id = property_type.vertex_id();

            // Insert the vertex into the subgraph to avoid another lookup when traversing it
            subgraph.insert(property_type);

            self.traverse_property_type(
                &vertex_id,
                &mut dependency_context,
                &mut subgraph,
                graph_resolve_depths,
            )
            .await?;

            subgraph.roots.insert(vertex_id.into());
        }

        Ok(subgraph)
    }

    #[tracing::instrument(level = "info", skip(self, property_type))]
    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
        updated_by: UpdatedById,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        let transaction = self.transaction().await.change_context(UpdateError)?;

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_property_type_references` taking `&property_type`
        let (version_id, metadata) = transaction
            .update::<PropertyType>(property_type.clone(), updated_by)
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

        transaction.commit().await.change_context(UpdateError)?;

        Ok(metadata)
    }
}
