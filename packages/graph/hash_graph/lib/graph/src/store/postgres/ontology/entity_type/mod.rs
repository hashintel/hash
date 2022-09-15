mod resolve;

use std::{future::Future, pin::Pin};

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
            DependencyMap, PersistedOntologyType,
        },
        AsClient, EntityTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
};

pub struct EntityTypeDependencyContext<'a> {
    pub referenced_data_types: &'a mut DependencyMap<VersionedUri, PersistedDataType>,
    pub referenced_property_types: &'a mut DependencyMap<VersionedUri, PersistedPropertyType>,
    pub referenced_link_types: &'a mut DependencyMap<VersionedUri, PersistedLinkType>,
    pub referenced_entity_types: &'a mut DependencyMap<VersionedUri, PersistedEntityType>,
    pub data_type_query_depth: QueryDepth,
    pub property_type_query_depth: QueryDepth,
    pub link_type_query_depth: QueryDepth,
    pub entity_type_query_depth: QueryDepth,
}

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedEntityType`] into four [`DependencyMap`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_entity_type_as_dependency<'a>(
        &'a self,
        entity_type_uri: &'a VersionedUri,
        context: EntityTypeDependencyContext<'a>,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        let EntityTypeDependencyContext {
            referenced_data_types,
            referenced_property_types,
            referenced_link_types,
            referenced_entity_types,
            data_type_query_depth,
            property_type_query_depth,
            link_type_query_depth,
            entity_type_query_depth,
        } = context;

        async move {
            let unresolved_entity_type = referenced_entity_types
                .insert(entity_type_uri, entity_type_query_depth, || async {
                    Ok(PersistedEntityType::from_record(
                        self.read_versioned_ontology_type(entity_type_uri).await?,
                    ))
                })
                .await?;

            if let Some(entity_type) = unresolved_entity_type {
                if property_type_query_depth > 0 {
                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    for property_type_ref in entity_type.inner.property_type_references() {
                        self.get_property_type_as_dependency(
                            property_type_ref.uri(),
                            PropertyTypeDependencyContext {
                                referenced_data_types,
                                referenced_property_types,
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
                                &link_type_uri,
                                LinkTypeDependencyContext {
                                    referenced_link_types,
                                    link_type_query_depth: link_type_query_depth - 1,
                                },
                            )
                            .await?;
                        }
                        if entity_type_query_depth > 0 {
                            self.get_entity_type_as_dependency(
                                &entity_type_uri,
                                EntityTypeDependencyContext {
                                    referenced_data_types,
                                    referenced_property_types,
                                    referenced_link_types,
                                    referenced_entity_types,
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
        owned_by_id: AccountId,
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
        let (version_id, identifier) = transaction.create(entity_type.clone(), owned_by_id).await?;

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
                let mut referenced_data_types = DependencyMap::new();
                let mut referenced_property_types = DependencyMap::new();
                let mut referenced_link_types = DependencyMap::new();
                let mut referenced_entity_types = DependencyMap::new();

                if property_type_query_depth > 0 {
                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    for data_type_ref in entity_type.inner.property_type_references() {
                        self.get_property_type_as_dependency(
                            data_type_ref.uri(),
                            PropertyTypeDependencyContext {
                                referenced_data_types: &mut referenced_data_types,
                                referenced_property_types: &mut referenced_property_types,
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
                                link_type_uri,
                                LinkTypeDependencyContext {
                                    referenced_link_types: &mut referenced_link_types,
                                    link_type_query_depth: link_type_query_depth - 1,
                                },
                            )
                            .await?;
                        }
                        if entity_type_query_depth > 0 {
                            self.get_entity_type_as_dependency(
                                entity_type_ref.uri(),
                                EntityTypeDependencyContext {
                                    referenced_data_types: &mut referenced_data_types,
                                    referenced_property_types: &mut referenced_property_types,
                                    referenced_link_types: &mut referenced_link_types,
                                    referenced_entity_types: &mut referenced_entity_types,
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
                    referenced_data_types: referenced_data_types.into_vec(),
                    referenced_property_types: referenced_property_types.into_vec(),
                    referenced_link_types: referenced_link_types.into_vec(),
                    referenced_entity_types: referenced_entity_types.into_vec(),
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
