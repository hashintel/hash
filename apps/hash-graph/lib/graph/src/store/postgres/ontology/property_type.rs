use std::{borrow::Borrow, mem};

use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use type_system::PropertyType;

use crate::{
    ontology::{DataTypeWithMetadata, OntologyElementMetadata, PropertyTypeWithMetadata},
    provenance::RecordCreatedById,
    store::{
        crud::Read, postgres::TraversalContext, query::Filter, AsClient, InsertionError,
        PostgresStore, PropertyTypeStore, QueryError, Record, UpdateError,
    },
    subgraph::{
        edges::{GraphResolveDepths, OntologyEdgeKind, OutgoingEdgeResolveDepth},
        identifier::PropertyTypeVertexId,
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
    pub(crate) async fn traverse_property_types(
        &self,
        mut property_type_queue: Vec<(PropertyTypeVertexId, GraphResolveDepths, QueryTemporalAxes)>,
        traversal_context: &mut TraversalContext,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let time_axis = subgraph.temporal_axes.resolved.variable_time_axis();

        let mut data_type_queue = Vec::new();

        while !property_type_queue.is_empty() {
            // TODO: We could re-use the memory here but we expect to batch the processing of this
            //       for-loop. See https://app.asana.com/0/0/1204117847656663/f
            for (property_type_vertex_id, graph_resolve_depths, temporal_axes) in
                mem::take(&mut property_type_queue)
            {
                if graph_resolve_depths.constrains_values_on.outgoing > 0 {
                    for data_type in <Self as Read<DataTypeWithMetadata>>::read(
                        self,
                        &Filter::<DataTypeWithMetadata>::for_ontology_edge_by_property_type_vertex_id(
                            &property_type_vertex_id,
                            OntologyEdgeKind::ConstrainsValuesOn,
                        ),
                        &temporal_axes,
                    )
                    .await?
                    {
                        let data_type_vertex_id = data_type.vertex_id(time_axis);

                        subgraph.insert_edge(
                            &property_type_vertex_id,
                            OntologyEdgeKind::ConstrainsValuesOn,
                            data_type_vertex_id.clone(),
                        );

                        subgraph.insert_vertex(&data_type_vertex_id, data_type);

                        data_type_queue.push((
                            data_type_vertex_id,
                            GraphResolveDepths {
                                constrains_values_on: OutgoingEdgeResolveDepth {
                                    outgoing: graph_resolve_depths.constrains_values_on.outgoing
                                        - 1,
                                    ..graph_resolve_depths.constrains_values_on
                                },
                                ..graph_resolve_depths
                            },
                            temporal_axes.clone()
                        ));
                    }
                }

                if graph_resolve_depths.constrains_properties_on.outgoing > 0 {
                    for referenced_property_type in <Self as Read<PropertyTypeWithMetadata>>::read(
                        self,
                        &Filter::<PropertyTypeWithMetadata>::for_ontology_edge_by_property_type_vertex_id(
                            &property_type_vertex_id,
                            OntologyEdgeKind::ConstrainsPropertiesOn,
                            true,
                        ),
                        &temporal_axes,
                    )
                    .await?
                    {
                        let referenced_property_type_vertex_id = referenced_property_type.vertex_id(time_axis);

                        subgraph.insert_edge(
                            &property_type_vertex_id,
                            OntologyEdgeKind::ConstrainsPropertiesOn,
                            referenced_property_type_vertex_id.clone(),
                        );

                        subgraph
                            .insert_vertex(&property_type_vertex_id, referenced_property_type);

                        property_type_queue.push((
                            referenced_property_type_vertex_id,
                            GraphResolveDepths {
                                constrains_properties_on: OutgoingEdgeResolveDepth {
                                    outgoing: graph_resolve_depths
                                        .constrains_properties_on
                                        .outgoing
                                        - 1,
                                    ..graph_resolve_depths.constrains_properties_on
                                },
                                ..graph_resolve_depths
                            },
                            temporal_axes.clone(),
                        ));
                    }
                }
            }
        }

        self.traverse_data_types(data_type_queue, traversal_context, subgraph)
            .await?;

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
        self.traverse_property_types(
            subgraph
                .vertices
                .property_types
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

    #[tracing::instrument(level = "info", skip(self, property_type))]
    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
        updated_by: RecordCreatedById,
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
