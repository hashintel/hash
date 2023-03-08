use std::{borrow::Borrow, mem};

use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use type_system::{DataTypeReference, PropertyType, PropertyTypeReference};

use crate::{
    ontology::{OntologyElementMetadata, OntologyTypeWithMetadata, PropertyTypeWithMetadata},
    provenance::UpdatedById,
    store::{
        crud::Read, postgres::TraversalContext, AsClient, InsertionError, PostgresStore,
        PropertyTypeStore, QueryError, Record, UpdateError,
    },
    subgraph::{
        edges::{
            Edge, GraphResolveDepths, OntologyEdgeKind, OntologyOutwardEdge,
            OutgoingEdgeResolveDepth, OutwardEdge,
        },
        identifier::{DataTypeVertexId, OntologyTypeVertexId, PropertyTypeVertexId},
        query::StructuralQuery,
        temporal_axes::QueryTemporalAxes,
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PropertyTypeWithMetadata`] into two [`TraversalContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "trace", skip(self, traversal_context, subgraph))]
    pub(crate) async fn traverse_property_type(
        &self,
        property_type_ids: Vec<PropertyTypeVertexId>,
        temporal_axes: QueryTemporalAxes,
        graph_resolve_depths: GraphResolveDepths,
        traversal_context: &mut TraversalContext,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let mut queue = property_type_ids
            .into_iter()
            .map(|id| (id, graph_resolve_depths, temporal_axes.clone()))
            .collect::<Vec<_>>();

        while !queue.is_empty() {
            // TODO: We could re-use the memory here but we expect to batch the processing of this
            //       for-loop. See https://app.asana.com/0/0/1204117847656663/f
            for (property_type_id, current_resolve_depths, temporal_axes) in mem::take(&mut queue) {
                let property_type = subgraph
                    .get_or_read::<PropertyTypeWithMetadata>(
                        self,
                        &property_type_id,
                        &temporal_axes,
                    )
                    .await?;

                // Collecting references before traversing further to avoid having a shared
                // reference to the subgraph when borrowing it mutably
                let data_type_ref_urls = (current_resolve_depths.constrains_values_on.outgoing > 0)
                    .then(|| {
                        property_type
                            .inner()
                            .data_type_references()
                            .into_iter()
                            .map(DataTypeReference::url)
                            .cloned()
                            .collect::<Vec<_>>()
                    });

                let property_type_ref_urls =
                    (current_resolve_depths.constrains_properties_on.outgoing > 0).then(|| {
                        property_type
                            .inner()
                            .property_type_references()
                            .into_iter()
                            .map(PropertyTypeReference::url)
                            .cloned()
                            .collect::<Vec<_>>()
                    });

                if let Some(data_type_ref_urls) = data_type_ref_urls {
                    for data_type_ref in data_type_ref_urls {
                        let data_type_vertex_id = DataTypeVertexId::from(data_type_ref);

                        subgraph.edges.insert(Edge::Ontology {
                            vertex_id: OntologyTypeVertexId::PropertyType(property_type_id.clone()),
                            outward_edge: OntologyOutwardEdge::ToOntology(OutwardEdge {
                                kind: OntologyEdgeKind::ConstrainsValuesOn,
                                reversed: false,
                                right_endpoint: OntologyTypeVertexId::DataType(
                                    data_type_vertex_id.clone(),
                                ),
                            }),
                        });

                        self.traverse_data_type(
                            vec![data_type_vertex_id],
                            temporal_axes.clone(),
                            GraphResolveDepths {
                                constrains_values_on: OutgoingEdgeResolveDepth {
                                    outgoing: current_resolve_depths.constrains_values_on.outgoing
                                        - 1,
                                    ..current_resolve_depths.constrains_values_on
                                },
                                ..current_resolve_depths
                            },
                            traversal_context,
                            subgraph,
                        )
                        .await?;
                    }
                }

                if let Some(property_type_ref_urls) = property_type_ref_urls {
                    for property_type_ref_url in property_type_ref_urls {
                        let property_type_vertex_id =
                            PropertyTypeVertexId::from(property_type_ref_url);

                        subgraph.edges.insert(Edge::Ontology {
                            vertex_id: OntologyTypeVertexId::PropertyType(property_type_id.clone()),
                            outward_edge: OntologyOutwardEdge::ToOntology(OutwardEdge {
                                kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                                reversed: false,
                                right_endpoint: OntologyTypeVertexId::PropertyType(
                                    property_type_vertex_id.clone(),
                                ),
                            }),
                        });

                        queue.push((
                            property_type_vertex_id,
                            GraphResolveDepths {
                                constrains_properties_on: OutgoingEdgeResolveDepth {
                                    outgoing: current_resolve_depths
                                        .constrains_properties_on
                                        .outgoing
                                        - 1,
                                    ..current_resolve_depths.constrains_properties_on
                                },
                                ..current_resolve_depths
                            },
                            temporal_axes.clone(),
                        ));
                    }
                }
            }
        }

        Ok(())
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

        let property_types = Read::<PropertyTypeWithMetadata>::read(self, filter, &temporal_axes)
            .await?
            .into_iter()
            .map(|entity| (entity.vertex_id(time_axis), entity))
            .collect();

        let mut subgraph = Subgraph::new(
            graph_resolve_depths,
            unresolved_temporal_axes.clone(),
            temporal_axes.clone(),
        );
        subgraph.vertices.property_types = property_types;

        for vertex_id in subgraph.vertices.property_types.keys() {
            subgraph.roots.insert(vertex_id.clone().into());
        }

        // TODO: We currently pass in the subgraph as mutable reference, thus we cannot borrow the
        //       vertices and have to `.collect()` the keys.
        self.traverse_property_type(
            subgraph.vertices.property_types.keys().cloned().collect(),
            subgraph.temporal_axes.resolved.clone(),
            subgraph.depths,
            &mut TraversalContext,
            &mut subgraph,
        )
        .await?;

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
