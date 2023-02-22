use std::{borrow::Borrow, future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use futures::FutureExt;
use type_system::{DataTypeReference, PropertyType, PropertyTypeReference};

use crate::{
    identifier::OntologyTypeVertexId,
    ontology::{OntologyElementMetadata, OntologyTypeWithMetadata, PropertyTypeWithMetadata},
    provenance::UpdatedById,
    store::{
        crud::Read,
        postgres::{DependencyContext, DependencyStatus},
        AsClient, InsertionError, PostgresStore, PropertyTypeStore, QueryError, Record,
        UpdateError,
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
    /// Internal method to read a [`PropertyTypeWithMetadata`] into two [`DependencyContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "trace", skip(self, dependency_context, subgraph))]
    pub(crate) fn traverse_property_type<'a>(
        &'a self,
        property_type_id: &'a OntologyTypeVertexId,
        dependency_context: &'a mut DependencyContext,
        subgraph: &'a mut Subgraph,
        mut current_resolve_depths: GraphResolveDepths,
        mut temporal_axes: QueryTemporalAxes,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        async move {
            let dependency_status = dependency_context.ontology_dependency_map.update(
                property_type_id,
                current_resolve_depths,
                temporal_axes.variable_interval().convert(),
            );

            let property_type = match dependency_status {
                DependencyStatus::Unresolved(depths, interval) => {
                    // The dependency may have to be resolved more than anticipated, so we update
                    // the resolve depth and the temporal axes.
                    current_resolve_depths = depths;
                    temporal_axes.set_variable_interval(interval.convert());
                    subgraph
                        .get_or_read::<PropertyTypeWithMetadata>(
                            self,
                            property_type_id,
                            &temporal_axes,
                        )
                        .await?
                }
                DependencyStatus::Resolved => return Ok(()),
            };

            // Collecting references before traversing further to avoid having a shared
            // reference to the subgraph when borrowing it mutably
            let data_type_ref_uris = (current_resolve_depths.constrains_values_on.outgoing > 0)
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
                (current_resolve_depths.constrains_properties_on.outgoing > 0).then(|| {
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
                    let data_type_vertex_id = OntologyTypeVertexId::from(data_type_ref);

                    subgraph.edges.insert(Edge::Ontology {
                        vertex_id: property_type_id.clone(),
                        outward_edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                            kind: OntologyEdgeKind::ConstrainsValuesOn,
                            reversed: false,
                            right_endpoint: data_type_vertex_id.clone(),
                        }),
                    });

                    self.traverse_data_type(
                        &data_type_vertex_id,
                        dependency_context,
                        subgraph,
                        GraphResolveDepths {
                            constrains_values_on: OutgoingEdgeResolveDepth {
                                outgoing: current_resolve_depths.constrains_values_on.outgoing - 1,
                                ..current_resolve_depths.constrains_values_on
                            },
                            ..current_resolve_depths
                        },
                        temporal_axes.clone(),
                    )
                    .await?;
                }
            }

            if let Some(property_type_ref_uris) = property_type_ref_uris {
                for property_type_ref_uri in property_type_ref_uris {
                    let property_type_vertex_id = OntologyTypeVertexId::from(property_type_ref_uri);

                    subgraph.edges.insert(Edge::Ontology {
                        vertex_id: property_type_id.clone(),
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

            Ok(())
        }
        .boxed()
    }
}

#[async_trait]
impl<C: AsClient> PropertyTypeStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, property_types))]
    async fn create_property_types(
        &mut self,
        property_types: impl IntoIterator<
            Item = (
                PropertyType,
                impl Borrow<OntologyElementMetadata> + Send + Sync,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<(), InsertionError> {
        let property_types = property_types.into_iter();
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let mut inserted_property_types = Vec::with_capacity(property_types.size_hint().0);
        for (schema, metadata) in property_types {
            let ontology_id = transaction
                .create(schema.clone(), metadata.borrow())
                .await?;
            inserted_property_types.push((ontology_id, schema));
        }

        for (ontology_id, schema) in inserted_property_types {
            transaction
                .insert_property_type_references(&schema, ontology_id)
                .await
                .change_context(InsertionError)
                .attach_printable_lazy(|| {
                    format!(
                        "could not insert references for property type: {}",
                        schema.id()
                    )
                })
                .attach_lazy(|| schema.clone())?;
        }

        transaction.commit().await.change_context(InsertionError)?;

        Ok(())
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_property_type(
        &self,
        query: &StructuralQuery<PropertyTypeWithMetadata>,
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

        for property_type in
            Read::<PropertyTypeWithMetadata>::read(self, filter, &temporal_axes).await?
        {
            let vertex_id = property_type.vertex_id(time_axis);
            // Insert the vertex into the subgraph to avoid another lookup when traversing it
            subgraph.insert(&vertex_id, property_type);

            self.traverse_property_type(
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
        let (ontology_id, metadata) = transaction
            .update::<PropertyType>(property_type.clone(), updated_by)
            .await?;

        transaction
            .insert_property_type_references(&property_type, ontology_id)
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
