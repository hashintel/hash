use std::{collections::hash_map::RawEntryMut, future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::FutureExt;
use tokio_postgres::GenericClient;
use type_system::{DataTypeReference, PropertyType, PropertyTypeReference};

use crate::{
    identifier::{ontology::OntologyTypeEditionId, GraphElementEditionId},
    ontology::{OntologyElementMetadata, OntologyTypeWithMetadata, PropertyTypeWithMetadata},
    provenance::{OwnedById, UpdatedById},
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

            // Explicitly converting the unique reference to a shared reference to the vertex to
            // avoid mutating it by accident
            let property_type: Option<&PropertyTypeWithMetadata> = match dependency_status {
                DependencyStatus::Unresolved => {
                    match subgraph
                        .vertices
                        .property_types
                        .raw_entry_mut()
                        .from_key(property_type_id)
                    {
                        RawEntryMut::Occupied(entry) => Some(entry.into_mut()),
                        RawEntryMut::Vacant(entry) => {
                            let property_type = Read::<PropertyTypeWithMetadata>::read_one(
                                self,
                                &Filter::for_ontology_type_edition_id(property_type_id),
                            )
                            .await?;
                            Some(entry.insert(property_type_id.clone(), property_type).1)
                        }
                    }
                }
                DependencyStatus::Resolved => None,
            };

            if let Some(property_type) = property_type {
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
                            edition_id: property_type_id.clone(),
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

                if let Some(property_type_ref_uris) = property_type_ref_uris {
                    for property_type_ref_uri in property_type_ref_uris {
                        subgraph.edges.insert(Edge::Ontology {
                            edition_id: property_type_id.clone(),
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

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

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
        } = *query;

        let mut subgraph = Subgraph::new(graph_resolve_depths);
        let mut dependency_context = DependencyContext::default();

        for property_type in Read::<PropertyTypeWithMetadata>::read(self, filter).await? {
            let property_type_id = property_type.metadata().edition_id().clone();

            // Insert the vertex into the subgraph to avoid another lookup when traversing it
            subgraph
                .vertices
                .property_types
                .insert(property_type_id.clone(), property_type);

            self.traverse_property_type(
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

    #[tracing::instrument(level = "info", skip(self, property_type))]
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

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(metadata)
    }
}
