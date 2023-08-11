use std::collections::HashSet;

use async_trait::async_trait;
#[cfg(hash_graph_test_environment)]
use error_stack::IntoReport;
use error_stack::{Report, Result, ResultExt};
use futures::{stream, TryStreamExt};
use type_system::{url::VersionedUrl, DataType};

#[cfg(hash_graph_test_environment)]
use crate::store::error::DeletionError;
use crate::{
    identifier::time::RightBoundedTemporalInterval,
    ontology::{
        DataTypeWithMetadata, OntologyElementMetadata, OntologyTemporalMetadata,
        PartialOntologyElementMetadata,
    },
    provenance::{RecordArchivedById, RecordCreatedById},
    store::{
        crud::Read,
        postgres::{ontology::OntologyId, TraversalContext},
        AsClient, ConflictBehavior, DataTypeStore, InsertionError, PostgresStore, QueryError,
        UpdateError,
    },
    subgraph::{
        edges::GraphResolveDepths, query::StructuralQuery, temporal_axes::VariableAxis, Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`DataTypeWithMetadata`] into a [`TraversalContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "trace", skip(self, _traversal_context, _subgraph))]
    pub(crate) async fn traverse_data_types(
        &self,
        queue: Vec<(
            OntologyId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        _traversal_context: &mut TraversalContext,
        _subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        // TODO: data types currently have no references to other types, so we don't need to do
        //       anything here
        //   see https://app.asana.com/0/1200211978612931/1202464168422955/f

        Ok(())
    }

    #[tracing::instrument(level = "trace", skip(self))]
    #[cfg(hash_graph_test_environment)]
    pub async fn delete_data_types(&mut self) -> Result<(), DeletionError> {
        let transaction = self.transaction().await.change_context(DeletionError)?;

        let data_types = transaction
            .as_client()
            .query(
                r"
                    DELETE FROM data_types
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

        transaction.delete_ontology_ids(&data_types).await?;

        transaction.commit().await.change_context(DeletionError)?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> DataTypeStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, data_types))]
    async fn create_data_types(
        &mut self,
        data_types: impl IntoIterator<Item = (DataType, PartialOntologyElementMetadata), IntoIter: Send>
        + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<Vec<OntologyElementMetadata>, InsertionError> {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let mut inserted_data_type_metadata = Vec::new();
        for (schema, metadata) in data_types {
            if let Some((ontology_id, transaction_time)) = transaction
                .create_ontology_metadata(&metadata.record_id, &metadata.custom, on_conflict)
                .await?
            {
                transaction
                    .insert_with_id(ontology_id, schema.clone())
                    .await?;
                inserted_data_type_metadata.push(OntologyElementMetadata::from_partial(
                    metadata,
                    transaction_time,
                ));
            }
        }

        transaction.commit().await.change_context(InsertionError)?;

        Ok(inserted_data_type_metadata)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_data_type(
        &self,
        query: &StructuralQuery<DataTypeWithMetadata>,
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
            // TODO: Remove again when subgraph logic was revisited
            //   see https://linear.app/hash/issue/H-297
            let mut visited_ontology_ids = HashSet::new();

            subgraph.vertices.data_types =
                Read::<DataTypeWithMetadata>::read_vec(self, filter, Some(&temporal_axes))
                    .await?
                    .into_iter()
                    .filter_map(|data_type| {
                        // The records are already sorted by time, so we can just take the first
                        // one
                        visited_ontology_ids
                            .insert(data_type.vertex_id(time_axis))
                            .then(|| (data_type.vertex_id(time_axis), data_type))
                    })
                    .collect();
            for vertex_id in subgraph.vertices.data_types.keys() {
                subgraph.roots.insert(vertex_id.clone().into());
            }
        } else {
            let mut traversal_context = TraversalContext::default();
            let traversal_data = self
                .read_ontology_ids::<DataTypeWithMetadata>(filter, Some(&temporal_axes))
                .await?
                .map_ok(|(vertex_id, ontology_id)| {
                    subgraph.roots.insert(vertex_id.into());
                    stream::iter(
                        traversal_context
                            .add_data_type_id(
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

            self.traverse_data_types(traversal_data, &mut traversal_context, &mut subgraph)
                .await?;

            traversal_context
                .read_traversed_vertices(self, &mut subgraph)
                .await?;
        }

        Ok(subgraph)
    }

    #[tracing::instrument(level = "info", skip(self, data_type))]
    async fn update_data_type(
        &mut self,
        data_type: DataType,
        record_created_by_id: RecordCreatedById,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        let transaction = self.transaction().await.change_context(UpdateError)?;

        let (_, metadata) = transaction
            .update::<DataType>(data_type, record_created_by_id)
            .await?;

        transaction.commit().await.change_context(UpdateError)?;

        Ok(metadata)
    }

    async fn archive_data_type(
        &mut self,
        id: &VersionedUrl,
        record_archived_by_id: RecordArchivedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.archive_ontology_type(id, record_archived_by_id).await
    }

    async fn unarchive_data_type(
        &mut self,
        id: &VersionedUrl,
        record_created_by_id: RecordCreatedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.unarchive_ontology_type(id, record_created_by_id).await
    }
}
