use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, DataType};

use crate::{
    identifier::GraphElementEditionIdentifier,
    ontology::{PersistedDataType, PersistedOntologyMetadata},
    provenance::{CreatedById, OwnedById, UpdatedById},
    store::{
        crud::Read,
        postgres::{context::PostgresContext, DependencyContext, DependencyContextRef},
        AsClient, DataTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
    subgraph::{StructuralQuery, Subgraph},
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedDataType`] into a [`DependencyContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) async fn get_data_type_as_dependency(
        &self,
        data_type_id: &VersionedUri,
        context: DependencyContextRef<'_>,
    ) -> Result<(), QueryError> {
        let DependencyContextRef {
            referenced_data_types,
            graph_resolve_depths,
            ..
        } = context;

        let _unresolved_entity_type = referenced_data_types
            .insert_with(
                data_type_id,
                Some(graph_resolve_depths.data_type_resolve_depth),
                || async {
                    Ok(PersistedDataType::from(
                        self.read_versioned_ontology_type(data_type_id).await?,
                    ))
                },
            )
            .await?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> DataTypeStore for PostgresStore<C> {
    async fn create_data_type(
        &mut self,
        data_type: DataType,
        owned_by_id: OwnedById,
        created_by_id: CreatedById,
    ) -> Result<PersistedOntologyMetadata, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let (_, metadata) = transaction
            .create(data_type, owned_by_id, created_by_id)
            .await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(metadata)
    }

    async fn get_data_type<'f: 'q, 'q>(
        &self,
        query: &'f StructuralQuery<'q, DataType>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
        } = *query;

        let subgraphs = stream::iter(Read::<PersistedDataType>::read(self, filter).await?)
            .then(|data_type| async move {
                let mut dependency_context = DependencyContext::new(graph_resolve_depths);

                let data_type_id = data_type.metadata().identifier().uri().clone();
                dependency_context
                    .referenced_data_types
                    .insert(&data_type_id, None, data_type);

                self.get_data_type_as_dependency(&data_type_id, dependency_context.as_ref_object())
                    .await?;

                let root = GraphElementEditionIdentifier::OntologyElementEditionId(data_type_id);

                Ok::<_, Report<QueryError>>(dependency_context.into_subgraph(vec![root]))
            })
            .try_collect::<Vec<_>>()
            .await?;

        let mut subgraph = Subgraph::new(graph_resolve_depths);
        subgraph.extend(subgraphs);

        Ok(subgraph)
    }

    async fn update_data_type(
        &mut self,
        data_type: DataType,
        updated_by_id: UpdatedById,
    ) -> Result<PersistedOntologyMetadata, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        let (_, metadata) = transaction.update(data_type, updated_by_id).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(metadata)
    }
}
