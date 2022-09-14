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
use type_system::{uri::VersionedUri, EntityType};

use crate::{
    ontology::{
        AccountId, EntityTypeQuery, EntityTypeRootedSubgraph, PersistedDataType,
        PersistedEntityType, PersistedLinkType, PersistedOntologyIdentifier, PersistedPropertyType,
        QueryDepth,
    },
    store::{
        crud::Read,
        postgres::{
            context::PostgresContext,
            ontology::{
                link_type::LinkTypeDependencyContext, property_type::PropertyTypeDependencyContext,
            },
            PersistedOntologyType,
        },
        AsClient, EntityTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
};

pub struct EntityTypeDependencyContext<'a> {
    pub data_type_references: &'a mut HashMap<VersionedUri, PersistedDataType>,
    pub property_type_references: &'a mut HashMap<VersionedUri, PersistedPropertyType>,
    pub link_type_references: &'a mut HashMap<VersionedUri, PersistedLinkType>,
    pub entity_type_references: &'a mut HashMap<VersionedUri, PersistedEntityType>,
    pub data_type_query_depth: QueryDepth,
    pub property_type_query_depth: QueryDepth,
    pub link_type_query_depth: QueryDepth,
    pub entity_type_query_depth: QueryDepth,
}

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedEntityType`] into a [`HashMap`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_entity_type_as_dependency<'a>(
        &'a self,
        entity_type_uri: VersionedUri,
        context: EntityTypeDependencyContext<'a>,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        let EntityTypeDependencyContext {
            data_type_references,
            property_type_references,
            link_type_references,
            entity_type_references,
            data_type_query_depth,
            property_type_query_depth,
            link_type_query_depth,
            entity_type_query_depth,
        } = context;

        async move {
            // URI is cloned due to limitations of Entry API, see
            // https://stackoverflow.com/questions/51542024
            if let Entry::Vacant(entry) = entity_type_references.entry(entity_type_uri) {
                let entity_type = PersistedEntityType::from_record(
                    self.read_versioned_ontology_type::<EntityType>(entry.key())
                        .await?,
                );
                let entity_type = entry.insert(entity_type);

                if property_type_query_depth > 0 {
                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    for property_type_ref in entity_type.inner.property_type_references() {
                        self.get_property_type_as_dependency(
                            property_type_ref.uri().clone(),
                            PropertyTypeDependencyContext {
                                data_type_references,
                                property_type_references,
                                data_type_query_depth,
                                property_type_query_depth: property_type_query_depth - 1,
                            },
                        )
                        .await?;
                    }
                }

                if link_type_query_depth > 0 || entity_type_query_depth > 0 {
                    let linked_uris = entity_type
                        .inner
                        .link_type_references()
                        .into_iter()
                        .map(|(link_type_uri, entity_type_uri)| {
                            (link_type_uri.clone(), entity_type_uri.uri().clone())
                        })
                        .collect::<Vec<_>>();

                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    for (link_type_uri, entity_type_uri) in linked_uris {
                        if link_type_query_depth > 0 {
                            self.get_link_type_as_dependency(
                                link_type_uri,
                                LinkTypeDependencyContext {
                                    link_type_references,
                                    _link_type_query_depth: link_type_query_depth - 1,
                                },
                            )
                            .await?;
                        }
                        if entity_type_query_depth > 0 {
                            self.get_entity_type_as_dependency(
                                entity_type_uri,
                                EntityTypeDependencyContext {
                                    data_type_references,
                                    property_type_references,
                                    link_type_references,
                                    entity_type_references,
                                    data_type_query_depth,
                                    property_type_query_depth,
                                    link_type_query_depth,
                                    entity_type_query_depth: entity_type_query_depth - 1,
                                },
                            )
                            .await?;
                        }
                    }
                }
            }

            Ok(())
        }
        .boxed()
    }
}

#[async_trait]
impl<C: AsClient> EntityTypeStore for PostgresStore<C> {
    async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
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
        // after as well. See `insert_entity_type_references` taking `&entity_type`
        let (version_id, identifier) = transaction.create(entity_type.clone(), created_by).await?;

        transaction
            .insert_entity_type_references(&entity_type, version_id)
            .await
            .change_context(InsertionError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for entity type: {}",
                    entity_type.id()
                )
            })
            .attach_lazy(|| entity_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(identifier)
    }

    async fn get_entity_type(
        &self,
        query: &EntityTypeQuery,
    ) -> Result<Vec<EntityTypeRootedSubgraph>, QueryError> {
        let EntityTypeQuery {
            ref expression,
            data_type_query_depth,
            property_type_query_depth,
            link_type_query_depth,
            entity_type_query_depth,
        } = *query;

        stream::iter(Read::<PersistedEntityType>::read(self, expression).await?)
            .then(|entity_type: PersistedEntityType| async {
                let mut data_type_references = HashMap::new();
                let mut property_type_references = HashMap::new();
                let mut link_type_references = HashMap::new();
                let mut entity_type_references = HashMap::new();

                if property_type_query_depth > 0 {
                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    for data_type_ref in entity_type.inner.property_type_references() {
                        self.get_property_type_as_dependency(
                            data_type_ref.uri().clone(),
                            PropertyTypeDependencyContext {
                                data_type_references: &mut data_type_references,
                                property_type_references: &mut property_type_references,
                                data_type_query_depth,
                                property_type_query_depth: property_type_query_depth - 1,
                            },
                        )
                        .await?;
                    }
                }

                if link_type_query_depth > 0 || entity_type_query_depth > 0 {
                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    for (link_type_uri, entity_type_ref) in entity_type.inner.link_type_references()
                    {
                        if link_type_query_depth > 0 {
                            self.get_link_type_as_dependency(
                                link_type_uri.clone(),
                                LinkTypeDependencyContext {
                                    link_type_references: &mut link_type_references,
                                    _link_type_query_depth: link_type_query_depth - 1,
                                },
                            )
                            .await?;
                        }
                        if entity_type_query_depth > 0 {
                            self.get_entity_type_as_dependency(
                                entity_type_ref.uri().clone(),
                                EntityTypeDependencyContext {
                                    data_type_references: &mut data_type_references,
                                    property_type_references: &mut property_type_references,
                                    link_type_references: &mut link_type_references,
                                    entity_type_references: &mut entity_type_references,
                                    data_type_query_depth,
                                    property_type_query_depth,
                                    link_type_query_depth,
                                    entity_type_query_depth: entity_type_query_depth - 1,
                                },
                            )
                            .await?;
                        }
                    }
                }

                Ok(EntityTypeRootedSubgraph {
                    entity_type,
                    referenced_data_types: data_type_references.into_values().collect(),
                    referenced_property_types: property_type_references.into_values().collect(),
                    referenced_link_types: link_type_references.into_values().collect(),
                    referenced_entity_types: entity_type_references.into_values().collect(),
                })
            })
            .try_collect()
            .await
    }

    async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
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
        // after as well. See `insert_entity_type_references` taking `&entity_type`
        let (version_id, identifier) = transaction.update(entity_type.clone(), updated_by).await?;

        transaction
            .insert_entity_type_references(&entity_type, version_id)
            .await
            .change_context(UpdateError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for entity type: {}",
                    entity_type.id()
                )
            })
            .attach_lazy(|| entity_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(identifier)
    }
}
