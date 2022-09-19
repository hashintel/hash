mod read;
mod resolve;

use std::{future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{future::FutureExt, stream, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;

use crate::{
    knowledge::{KnowledgeGraphQuery, Link, LinkRootedSubgraph, PersistedLink},
    ontology::AccountId,
    store::{
        crud::Read,
        error::LinkRemovalError,
        postgres::{
            knowledge::KnowledgeDependencyContext, ontology::LinkTypeDependencyContext,
            DependencyMap, DependencySet,
        },
        AsClient, InsertionError, LinkStore, PostgresStore, QueryError,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`Link`] into a [`DependencyMap`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_link_as_dependency<'a>(
        &'a self,
        link: &'a PersistedLink,
        context: KnowledgeDependencyContext<'a>,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        let KnowledgeDependencyContext {
            referenced_data_types,
            referenced_property_types,
            referenced_link_types,
            referenced_entity_types,
            linked_entities,
            links,
            data_type_query_depth,
            property_type_query_depth,
            link_type_query_depth,
            entity_type_query_depth,
            link_query_depth,
            link_target_entity_query_depth,
        } = context;

        async move {
            if let Some(link) = links.insert(link, link_query_depth) {
                if link_type_query_depth > 0 {
                    self.get_link_type_as_dependency(
                        link.inner().link_type_id(),
                        LinkTypeDependencyContext {
                            referenced_link_types,
                            link_type_query_depth: link_type_query_depth - 1,
                        },
                    )
                    .await?;
                }

                if link_target_entity_query_depth > 0 {
                    let target_entity_id = link.inner().target_entity();
                    self.get_entity_as_dependency(target_entity_id, KnowledgeDependencyContext {
                        referenced_data_types,
                        referenced_property_types,
                        referenced_link_types,
                        referenced_entity_types,
                        linked_entities,
                        links,
                        data_type_query_depth,
                        property_type_query_depth,
                        link_type_query_depth,
                        entity_type_query_depth,
                        link_query_depth,
                        link_target_entity_query_depth: link_target_entity_query_depth - 1,
                    })
                    .await?;
                }
            }

            Ok(())
        }
        .boxed()
    }
}

#[async_trait]
impl<C: AsClient> LinkStore for PostgresStore<C> {
    async fn create_link(
        &mut self,
        link: &Link,
        owned_by_id: AccountId,
    ) -> Result<(), InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        transaction.insert_link(link, owned_by_id).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn get_links(
        &self,
        query: &KnowledgeGraphQuery,
    ) -> Result<Vec<LinkRootedSubgraph>, QueryError> {
        let KnowledgeGraphQuery {
            ref expression,
            data_type_query_depth,
            property_type_query_depth,
            link_type_query_depth,
            entity_type_query_depth,
            link_target_entity_query_depth,
            link_query_depth,
        } = *query;

        stream::iter(Read::<PersistedLink>::read(self, expression).await?)
            .then(|link| async move {
                let mut referenced_data_types = DependencyMap::new();
                let mut referenced_property_types = DependencyMap::new();
                let mut referenced_link_types = DependencyMap::new();
                let mut referenced_entity_types = DependencyMap::new();
                let mut linked_entities = DependencyMap::new();
                let mut links = DependencySet::new();

                self.get_link_as_dependency(&link, KnowledgeDependencyContext {
                    referenced_data_types: &mut referenced_data_types,
                    referenced_property_types: &mut referenced_property_types,
                    referenced_link_types: &mut referenced_link_types,
                    referenced_entity_types: &mut referenced_entity_types,
                    linked_entities: &mut linked_entities,
                    links: &mut links,
                    data_type_query_depth,
                    property_type_query_depth,
                    link_type_query_depth,
                    entity_type_query_depth,
                    link_target_entity_query_depth,
                    link_query_depth,
                })
                .await?;

                let root = links
                    .remove(&link)
                    .expect("root was not added to the subgraph");

                Ok(LinkRootedSubgraph {
                    link: root,
                    referenced_data_types: referenced_data_types.into_vec(),
                    referenced_property_types: referenced_property_types.into_vec(),
                    referenced_link_types: referenced_link_types.into_vec(),
                    referenced_entity_types: referenced_entity_types.into_vec(),
                    linked_entities: linked_entities.into_vec(),
                    links: links.into_vec(),
                })
            })
            .try_collect()
            .await
    }

    async fn remove_link(
        &mut self,
        link: &Link,
        removed_by_id: AccountId,
    ) -> Result<(), LinkRemovalError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(LinkRemovalError)?,
        );

        transaction
            .move_link_to_history(link, removed_by_id)
            .await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(LinkRemovalError)?;

        Ok(())
    }
}
