use std::borrow::Borrow;

use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use type_system::DataType;

use crate::{
    identifier::OntologyTypeVertexId,
    ontology::{DataTypeWithMetadata, OntologyElementMetadata},
    provenance::UpdatedById,
    store::{
        crud::Read,
        postgres::{DependencyContext, DependencyStatus},
        AsClient, DataTypeStore, InsertionError, PostgresStore, QueryError, Record, UpdateError,
    },
    subgraph::{
        edges::GraphResolveDepths, query::StructuralQuery, temporal_axes::QueryTemporalAxes,
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`DataTypeWithMetadata`] into a [`DependencyContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "trace", skip(self, dependency_context, subgraph))]
    pub(crate) async fn traverse_data_type(
        &self,
        data_type_id: &OntologyTypeVertexId,
        dependency_context: &mut DependencyContext,
        subgraph: &mut Subgraph,
        mut current_resolve_depths: GraphResolveDepths,
        mut temporal_axes: QueryTemporalAxes,
    ) -> Result<(), QueryError> {
        let dependency_status = dependency_context.ontology_dependency_map.update(
            data_type_id,
            current_resolve_depths,
            temporal_axes.variable_interval().convert(),
        );

        #[expect(unused_assignments, unused_variables)]
        let data_type = match dependency_status {
            DependencyStatus::Unresolved(depths, interval) => {
                // The dependency may have to be resolved more than anticipated, so we update
                // the resolve depth and the temporal axes.
                current_resolve_depths = depths;
                temporal_axes.set_variable_interval(interval.convert());
                subgraph
                    .get_or_read::<DataTypeWithMetadata>(self, data_type_id, &temporal_axes)
                    .await?
            }
            DependencyStatus::Resolved => return Ok(()),
        };

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

        let mut subgraph = Subgraph::new(
            graph_resolve_depths,
            unresolved_temporal_axes.clone(),
            temporal_axes.clone(),
        );
        let mut dependency_context = DependencyContext::default();

        for data_type in Read::<DataTypeWithMetadata>::read(self, filter, &temporal_axes).await? {
            let vertex_id = data_type.vertex_id(time_axis);
            // Insert the vertex into the subgraph to avoid another lookup when traversing it
            subgraph.insert(&vertex_id, data_type);

            self.traverse_data_type(
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

    #[tracing::instrument(level = "info", skip(self, data_type))]
    async fn update_data_type(
        &mut self,
        data_type: DataType,
        updated_by_id: UpdatedById,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        let transaction = self.transaction().await.change_context(UpdateError)?;

        let (_, metadata) = transaction
            .update::<DataType>(data_type, updated_by_id)
            .await?;

        transaction.commit().await.change_context(UpdateError)?;

        Ok(metadata)
    }
}
