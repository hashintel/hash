pub mod resolve;

use std::collections::{hash_map::Entry, HashMap};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, DataType};

use crate::{
    ontology::{
        AccountId, DataTypeQuery, DataTypeTree, PersistedDataType, PersistedOntologyIdentifier,
    },
    store::{
        crud::Read,
        postgres::{context::PostgresContext, PersistedOntologyType},
        AsClient, DataTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
};

impl<C: AsClient> PostgresStore<C> {
    // TODO: `_data_type_query_depth` is unused until data types can reference other data types
    //   see https://app.asana.com/0/1200211978612931/1202464168422955/f
    /// Internal method to read a [`PersistedDataType`] into a [`HashMap`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) async fn get_data_type_as_dependency(
        &self,
        data_type_uri: VersionedUri,
        data_types: &mut HashMap<VersionedUri, PersistedDataType>,
        _data_type_query_depth: u8,
    ) -> Result<(), QueryError> {
        if let Entry::Vacant(entry) = data_types.entry(data_type_uri) {
            let data_type = PersistedDataType::from_record(
                self.read_versioned_ontology_type::<DataType>(entry.key())
                    .await?,
            );
            entry.insert(data_type);
        }
        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> DataTypeStore for PostgresStore<C> {
    async fn create_data_type(
        &mut self,
        data_type: DataType,
        created_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let (_, identifier) = transaction.create(data_type, created_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(identifier)
    }

    async fn get_data_type(&self, query: &DataTypeQuery) -> Result<Vec<DataTypeTree>, QueryError> {
        stream::iter(Read::<PersistedDataType>::read(self, &query.expression).await?)
            .then(|data_type: PersistedDataType| async { Ok(DataTypeTree { data_type }) })
            .try_collect()
            .await
    }

    async fn update_data_type(
        &mut self,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        let (_, identifier) = transaction.update(data_type, updated_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(identifier)
    }
}
