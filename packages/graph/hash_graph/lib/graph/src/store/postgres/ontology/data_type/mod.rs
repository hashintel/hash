pub mod resolve;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, DataType};

use crate::{
    ontology::{
        AccountId, DataTypeQuery, DataTypeRootedSubgraph, OntologyQueryDepth, PersistedDataType,
        PersistedOntologyMetadata,
    },
    store::{
        crud::Read,
        postgres::{context::PostgresContext, DependencyMap, PersistedOntologyType},
        AsClient, DataTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
};

pub struct DataTypeDependencyContext<'a> {
    pub referenced_data_types:
        &'a mut DependencyMap<VersionedUri, PersistedDataType, OntologyQueryDepth>,
    // TODO: `data_type_query_depth` is unused until data types can reference other data types
    //   see https://app.asana.com/0/1200211978612931/1202464168422955/f
    pub data_type_query_depth: OntologyQueryDepth,
}

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedDataType`] into a [`DependencyMap`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) async fn get_data_type_as_dependency(
        &self,
        data_type_id: &VersionedUri,
        context: DataTypeDependencyContext<'_>,
    ) -> Result<(), QueryError> {
        let DataTypeDependencyContext {
            referenced_data_types,
            data_type_query_depth,
        } = context;

        let _unresolved_entity_type = referenced_data_types
            .insert(data_type_id, data_type_query_depth, || async {
                Ok(PersistedDataType::from_record(
                    self.read_versioned_ontology_type(data_type_id).await?,
                ))
            })
            .await?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> DataTypeStore for PostgresStore<C> {
    async fn create_data_type(
        &mut self,
        data_type: DataType,
        owned_by_id: AccountId,
    ) -> Result<PersistedOntologyMetadata, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let (_, metadata) = transaction.create(data_type, owned_by_id).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(metadata)
    }

    async fn get_data_type(
        &self,
        query: &DataTypeQuery,
    ) -> Result<Vec<DataTypeRootedSubgraph>, QueryError> {
        let DataTypeQuery {
            ref expression,
            data_type_query_depth,
        } = *query;

        stream::iter(Read::<PersistedDataType>::read(self, expression).await?)
            .then(|data_type| async move {
                let mut referenced_data_types = DependencyMap::new();

                self.get_data_type_as_dependency(
                    data_type.metadata.identifier().uri(),
                    DataTypeDependencyContext {
                        referenced_data_types: &mut referenced_data_types,
                        data_type_query_depth,
                    },
                )
                .await?;

                let root = referenced_data_types
                    .remove(data_type.metadata.identifier().uri())
                    .expect("root was not added to the subgraph");

                Ok(DataTypeRootedSubgraph { data_type: root })
            })
            .try_collect()
            .await
    }

    async fn update_data_type(
        &mut self,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyMetadata, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        let (_, metadata) = transaction.update(data_type, updated_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(metadata)
    }
}
