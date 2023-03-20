use std::borrow::Borrow;

use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use type_system::DataType;

use crate::{
    ontology::{DataTypeWithMetadata, OntologyElementMetadata},
    provenance::RecordCreatedById,
    store::{
        crud::Read, postgres::TraversalContext, AsClient, DataTypeStore, InsertionError,
        PostgresStore, QueryError, Record, UpdateError,
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
    pub(crate) async fn traverse_data_type(
        &self,
        data_type_ids: Vec<DataTypeVertexId>,
        temporal_axes: QueryTemporalAxes,
        graph_resolve_depths: GraphResolveDepths,
        _traversal_context: &mut TraversalContext,
        _subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        // TODO: data types currently have no references to other types, so we don't need to do
        //       anything here
        //   see https://app.asana.com/0/1200211978612931/1202464168422955/f

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
    ) -> Result<(), InsertionError> {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        for (schema, metadata) in data_types {
            transaction
                .create(schema.clone(), metadata.borrow())
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

        let data_types = Read::<DataTypeWithMetadata>::read(self, filter, &temporal_axes)
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
        self.traverse_data_type(
            subgraph.vertices.data_types.keys().cloned().collect(),
            subgraph.temporal_axes.resolved.clone(),
            subgraph.depths,
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
