use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use type_system::DataType;

use crate::{
    identifier::ontology::OntologyTypeEditionId,
    ontology::{DataTypeWithMetadata, OntologyElementMetadata},
    provenance::{OwnedById, UpdatedById},
    store::{
        crud::Read,
        postgres::{DependencyContext, DependencyStatus},
        AsClient, DataTypeStore, InsertionError, PostgresStore, QueryError, Record, Store,
        Transaction, UpdateError,
    },
    subgraph::{edges::GraphResolveDepths, query::StructuralQuery, Subgraph},
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`DataTypeWithMetadata`] into a [`DependencyContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "trace", skip(self, dependency_context, subgraph))]
    pub(crate) async fn traverse_data_type(
        &self,
        data_type_id: &OntologyTypeEditionId,
        dependency_context: &mut DependencyContext,
        subgraph: &mut Subgraph,
        current_resolve_depth: GraphResolveDepths,
    ) -> Result<(), QueryError> {
        let dependency_status = dependency_context
            .ontology_dependency_map
            .insert(data_type_id, current_resolve_depth);

        let _data_type = match dependency_status {
            DependencyStatus::Unresolved => {
                let time_projection = subgraph.resolved_time_projection.clone();
                subgraph
                    .get_or_read::<DataTypeWithMetadata>(self, data_type_id, &time_projection)
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
    #[tracing::instrument(level = "info", skip(self, data_type))]
    async fn create_data_type(
        &mut self,
        data_type: DataType,
        owned_by_id: OwnedById,
        updated_by_id: UpdatedById,
    ) -> Result<OntologyElementMetadata, InsertionError> {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let (_, metadata) = transaction
            .create(data_type, owned_by_id, updated_by_id)
            .await?;

        transaction.commit().await.change_context(InsertionError)?;

        Ok(metadata)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_data_type(
        &self,
        query: &StructuralQuery<DataTypeWithMetadata>,
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
        let time_axis = subgraph.resolved_time_projection.time_axis();

        for data_type in
            Read::<DataTypeWithMetadata>::read(self, filter, &subgraph.resolved_time_projection)
                .await?
        {
            let vertex_id = data_type.vertex_id(time_axis);
            // Insert the vertex into the subgraph to avoid another lookup when traversing it
            subgraph.insert(&vertex_id, data_type);

            self.traverse_data_type(
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
