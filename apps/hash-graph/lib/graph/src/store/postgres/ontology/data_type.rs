use std::borrow::Borrow;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use type_system::DataType;

use crate::{
    ontology::{DataTypeWithMetadata, OntologyElementMetadata},
    provenance::RecordCreatedById,
    store::{
        crud::Read,
        error::DeletionError,
        postgres::{ontology::OntologyId, TraversalContext},
        AsClient, ConflictBehavior, DataTypeStore, InsertionError, PostgresStore, QueryError,
        Record, UpdateError,
    },
    subgraph::{
        edges::GraphResolveDepths, identifier::DataTypeVertexId, query::StructuralQuery,
        temporal_axes::QueryTemporalAxes, Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`DataTypeWithMetadata`] into a [`TraversalContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "trace", skip(self, _traversal_context, _subgraph))]
    pub(crate) async fn traverse_data_types(
        &self,
        queue: Vec<(DataTypeVertexId, GraphResolveDepths, QueryTemporalAxes)>,
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
        data_types: impl IntoIterator<
            Item = (DataType, impl Borrow<OntologyElementMetadata> + Send + Sync),
            IntoIter: Send,
        > + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<(), InsertionError> {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        for (schema, metadata) in data_types {
            transaction
                .create(schema.clone(), metadata.borrow(), on_conflict)
                .await?;
        }

        transaction.commit().await.change_context(InsertionError)?;

        Ok(())
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

        let data_types = Read::<DataTypeWithMetadata>::read_vec(self, filter, Some(&temporal_axes))
            .await?
            .into_iter()
            .map(|entity| (entity.vertex_id(time_axis), entity))
            .collect();

        let mut subgraph = Subgraph::new(
            graph_resolve_depths,
            unresolved_temporal_axes.clone(),
            temporal_axes.clone(),
        );
        subgraph.vertices.data_types = data_types;

        for vertex_id in subgraph.vertices.data_types.keys() {
            subgraph.roots.insert(vertex_id.clone().into());
        }

        // TODO: We currently pass in the subgraph as mutable reference, thus we cannot borrow the
        //       vertices and have to `.collect()` the keys.
        self.traverse_data_types(
            subgraph
                .vertices
                .data_types
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
}
