use std::collections::HashMap;

use async_trait::async_trait;
#[cfg(hash_graph_test_environment)]
use error_stack::IntoReport;
use error_stack::{Report, Result, ResultExt};
use futures::{stream, TryStreamExt};
use type_system::{url::VersionedUrl, PropertyType};

#[cfg(hash_graph_test_environment)]
use crate::store::error::DeletionError;
use crate::{
    identifier::time::RightBoundedTemporalInterval,
    ontology::{
        OntologyElementMetadata, OntologyTemporalMetadata, PartialOntologyElementMetadata,
        PropertyTypeWithMetadata,
    },
    provenance::{RecordArchivedById, RecordCreatedById},
    store::{
        crud::Read,
        postgres::{
            ontology::{read::OntologyTypeTraversalData, OntologyId},
            query::ReferenceTable,
            TraversalContext,
        },
        AsClient, ConflictBehavior, InsertionError, PostgresStore, PropertyTypeStore, QueryError,
        UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, OntologyEdgeKind},
        identifier::{DataTypeVertexId, PropertyTypeVertexId},
        query::StructuralQuery,
        temporal_axes::VariableAxis,
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
        mut property_type_queue: Vec<(
            OntologyId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let mut data_type_queue = Vec::new();
        let mut edges_to_traverse = HashMap::<OntologyEdgeKind, OntologyTypeTraversalData>::new();

        while !property_type_queue.is_empty() {
            edges_to_traverse.clear();

            #[expect(clippy::iter_with_drain, reason = "false positive, vector is reused")]
            for (property_type_ontology_id, graph_resolve_depths, traversal_interval) in
                property_type_queue.drain(..)
            {
                for edge_kind in [
                    OntologyEdgeKind::ConstrainsValuesOn,
                    OntologyEdgeKind::ConstrainsPropertiesOn,
                ] {
                    if let Some(new_graph_resolve_depths) = graph_resolve_depths
                        .decrement_depth_for_edge(edge_kind, EdgeDirection::Outgoing)
                    {
                        edges_to_traverse.entry(edge_kind).or_default().push(
                            property_type_ontology_id,
                            new_graph_resolve_depths,
                            traversal_interval,
                        );
                    }
                }
            }

            if let Some(traversal_data) =
                edges_to_traverse.get(&OntologyEdgeKind::ConstrainsValuesOn)
            {
                data_type_queue.extend(
                    self.read_ontology_edges::<PropertyTypeVertexId, DataTypeVertexId>(
                        traversal_data,
                        ReferenceTable::PropertyTypeConstrainsValuesOn,
                    )
                    .await?
                    .flat_map(|edge| {
                        subgraph.insert_edge(
                            &edge.left_endpoint,
                            OntologyEdgeKind::ConstrainsValuesOn,
                            EdgeDirection::Outgoing,
                            edge.right_endpoint.clone(),
                        );

                        traversal_context.add_data_type_id(
                            edge.right_endpoint_ontology_id,
                            edge.resolve_depths,
                            edge.traversal_interval,
                        )
                    }),
                );
            }

            if let Some(traversal_data) =
                edges_to_traverse.get(&OntologyEdgeKind::ConstrainsPropertiesOn)
            {
                property_type_queue.extend(
                    self.read_ontology_edges::<PropertyTypeVertexId, PropertyTypeVertexId>(
                        traversal_data,
                        ReferenceTable::PropertyTypeConstrainsPropertiesOn,
                    )
                    .await?
                    .flat_map(|edge| {
                        subgraph.insert_edge(
                            &edge.left_endpoint,
                            OntologyEdgeKind::ConstrainsPropertiesOn,
                            EdgeDirection::Outgoing,
                            edge.right_endpoint.clone(),
                        );

                        traversal_context.add_property_type_id(
                            edge.right_endpoint_ontology_id,
                            edge.resolve_depths,
                            edge.traversal_interval,
                        )
                    }),
                );
            };
        }

        self.traverse_data_types(data_type_queue, traversal_context, subgraph)
            .await?;

        Ok(())
    }

    #[tracing::instrument(level = "trace", skip(self))]
    #[cfg(hash_graph_test_environment)]
    pub async fn delete_property_types(&mut self) -> Result<(), DeletionError> {
        let transaction = self.transaction().await.change_context(DeletionError)?;

        transaction
            .as_client()
            .simple_query(
                r"
                    DELETE FROM property_type_constrains_properties_on;
                    DELETE FROM property_type_constrains_values_on;
                ",
            )
            .await
            .into_report()
            .change_context(DeletionError)?;

        let property_types = transaction
            .as_client()
            .query(
                r"
                    DELETE FROM property_types
                    RETURNING ontology_id
                ",
                &[],
            )
            .await
            .into_report()
            .change_context(DeletionError)?
            .into_iter()
            .filter_map(|row| row.get(0))
            .collect::<Vec<OntologyId>>();

        transaction.delete_ontology_ids(&property_types).await?;

        transaction.commit().await.change_context(DeletionError)?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> PropertyTypeStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, property_types))]
    async fn create_property_types(
        &mut self,
        property_types: impl IntoIterator<
            Item = (PropertyType, PartialOntologyElementMetadata),
            IntoIter: Send,
        > + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<Vec<OntologyElementMetadata>, InsertionError> {
        let property_types = property_types.into_iter();
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let mut inserted_property_types = Vec::new();
        let mut inserted_property_type_metadata =
            Vec::with_capacity(inserted_property_types.capacity());
        for (schema, metadata) in property_types {
            if let Some((ontology_id, transaction_time)) = transaction
                .create_ontology_metadata(&metadata.record_id, &metadata.custom, on_conflict)
                .await?
            {
                transaction
                    .insert_with_id(ontology_id, schema.clone())
                    .await?;

                inserted_property_types.push((ontology_id, schema));
                inserted_property_type_metadata.push(OntologyElementMetadata::from_partial(
                    metadata,
                    transaction_time,
                ));
            }
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

        Ok(inserted_property_type_metadata)
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

        if graph_resolve_depths.is_empty() {
            subgraph.vertices.property_types =
                Read::<PropertyTypeWithMetadata>::read_vec(self, filter, Some(&temporal_axes))
                    .await?
                    .into_iter()
                    .map(|property_type| (property_type.vertex_id(time_axis), property_type))
                    .collect();
            for vertex_id in subgraph.vertices.property_types.keys() {
                subgraph.roots.insert(vertex_id.clone().into());
            }
        } else {
            let mut traversal_context = TraversalContext::default();
            let traversal_data = self
                .read_ontology_ids::<PropertyTypeWithMetadata>(filter, Some(&temporal_axes))
                .await?
                .map_ok(|(vertex_id, ontology_id)| {
                    subgraph.roots.insert(vertex_id.into());
                    stream::iter(
                        traversal_context
                            .add_property_type_id(
                                ontology_id,
                                graph_resolve_depths,
                                temporal_axes.variable_interval(),
                            )
                            .map(Ok::<_, Report<QueryError>>),
                    )
                })
                .try_flatten()
                .try_collect::<Vec<_>>()
                .await?;

            self.traverse_property_types(traversal_data, &mut traversal_context, &mut subgraph)
                .await?;

            traversal_context
                .read_traversed_vertices(self, &mut subgraph)
                .await?;
        }

        Ok(subgraph)
    }

    #[tracing::instrument(level = "info", skip(self, property_type))]
    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
        record_created_by_id: RecordCreatedById,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        let transaction = self.transaction().await.change_context(UpdateError)?;

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_property_type_references` taking `&property_type`
        let (ontology_id, metadata) = transaction
            .update::<PropertyType>(property_type.clone(), record_created_by_id)
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

    async fn archive_property_type(
        &mut self,
        id: &VersionedUrl,
        record_archived_by_id: RecordArchivedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.archive_ontology_type(id, record_archived_by_id).await
    }

    async fn unarchive_property_type(
        &mut self,
        id: &VersionedUrl,
        record_created_by_id: RecordCreatedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.unarchive_ontology_type(id, record_created_by_id).await
    }
}
