mod resolve;

use std::{
    collections::{hash_map::Entry, HashMap},
    future::Future,
    pin::Pin,
};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, PropertyType, PropertyTypeReference};

use crate::{
    ontology::{
        AccountId, PersistedDataType, PersistedOntologyIdentifier, PersistedPropertyType,
        PropertyTypeQuery, PropertyTypeRootedSubgraph,
    },
    store::{
        crud::Read,
        postgres::{
            context::PostgresContext, ontology::data_type::DataTypeDependencyContext,
            PersistedOntologyType,
        },
        AsClient, InsertionError, PostgresStore, PropertyTypeStore, QueryError, UpdateError,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedPropertyType`] into a [`HashMap`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_property_type_as_dependency<'a>(
        &'a self,
        property_type_uri: VersionedUri,
        data_type_references: &'a mut HashMap<VersionedUri, PersistedDataType>,
        property_type_references: &'a mut HashMap<VersionedUri, PersistedPropertyType>,
        data_type_query_depth: u8,
        property_type_query_depth: u8,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        async move {
            // TODO: Avoid cloning of URI
            //   see https://stackoverflow.com/questions/51542024
            if let Entry::Vacant(entry) = property_type_references.entry(property_type_uri) {
                let property_type = PersistedPropertyType::from_record(
                    self.read_versioned_ontology_type::<PropertyType>(entry.key())
                        .await?,
                );
                let property_type = entry.insert(property_type);

                if data_type_query_depth > 0 {
                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    for data_type_ref in property_type.inner.data_type_references() {
                        self.get_data_type_as_dependency(
                            data_type_ref.uri().clone(),
                            DataTypeDependencyContext {
                                data_type_references,
                                _data_type_query_depth: data_type_query_depth - 1,
                            },
                        )
                        .await?;
                    }
                }

                if property_type_query_depth > 0 {
                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    let property_type_uris = property_type
                        .inner
                        .property_type_references()
                        .into_iter()
                        .map(PropertyTypeReference::uri)
                        .cloned()
                        .collect::<Vec<_>>();

                    for property_type_uri in property_type_uris {
                        self.get_property_type_as_dependency(
                            property_type_uri,
                            data_type_references,
                            property_type_references,
                            data_type_query_depth,
                            property_type_query_depth - 1,
                        )
                        .await?;
                    }
                }
            }

            Ok(())
        }
        .boxed()
    }
}

#[async_trait]
impl<C: AsClient> PropertyTypeStore for PostgresStore<C> {
    async fn create_property_type(
        &mut self,
        property_type: PropertyType,
        created_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_property_type_references` taking `&property_type`
        let (version_id, identifier) = transaction
            .create(property_type.clone(), created_by)
            .await?;

        transaction
            .insert_property_type_references(&property_type, version_id)
            .await
            .change_context(InsertionError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for property type: {}",
                    property_type.id()
                )
            })
            .attach_lazy(|| property_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(identifier)
    }

    async fn get_property_type(
        &self,
        query: &PropertyTypeQuery,
    ) -> Result<Vec<PropertyTypeRootedSubgraph>, QueryError> {
        let PropertyTypeQuery {
            ref expression,
            data_type_query_depth,
            property_type_query_depth,
        } = *query;

        stream::iter(Read::<PersistedPropertyType>::read(self, expression).await?)
            .then(|property_type: PersistedPropertyType| async {
                let mut data_type_references = HashMap::new();
                let mut property_type_references = HashMap::new();

                if data_type_query_depth > 0 {
                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    for data_type_ref in property_type.inner.data_type_references() {
                        self.get_data_type_as_dependency(
                            data_type_ref.uri().clone(),
                            DataTypeDependencyContext {
                                data_type_references: &mut data_type_references,
                                _data_type_query_depth: data_type_query_depth - 1,
                            },
                        )
                        .await?;
                    }
                }

                if property_type_query_depth > 0 {
                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    for property_type_ref in property_type.inner.property_type_references() {
                        self.get_property_type_as_dependency(
                            property_type_ref.uri().clone(),
                            &mut data_type_references,
                            &mut property_type_references,
                            data_type_query_depth,
                            property_type_query_depth - 1,
                        )
                        .await?;
                    }
                }

                Ok(PropertyTypeRootedSubgraph {
                    property_type,
                    referenced_data_types: data_type_references.into_values().collect(),
                    referenced_property_types: property_type_references.into_values().collect(),
                })
            })
            .try_collect()
            .await
    }

    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_property_type_references` taking `&property_type`
        let (version_id, identifier) = transaction
            .update(property_type.clone(), updated_by)
            .await?;

        transaction
            .insert_property_type_references(&property_type, version_id)
            .await
            .change_context(UpdateError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for property type: {}",
                    property_type.id()
                )
            })
            .attach_lazy(|| property_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(identifier)
    }
}
