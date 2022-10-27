mod read;
mod resolve;

use std::{future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{future::FutureExt, stream, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;

use crate::{
    knowledge::{Link, LinkRootedSubgraph, PersistedLink},
    provenance::{CreatedById, OwnedById, RemovedById},
    shared::identifier::{GraphElementIdentifier, LinkId},
    store::{
        crud::Read,
        error::LinkRemovalError,
        postgres::{DependencyContext, DependencyContextRef},
        AsClient, InsertionError, LinkStore, PostgresStore, QueryError,
    },
    subgraph::{EdgeKind, GraphResolveDepths, NewStructuralQuery, OutwardEdge},
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`Link`] into a [`DependencyContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_link_as_dependency<'a: 'b, 'b>(
        &'a self,
        link: &'a PersistedLink,
        mut dependency_context: DependencyContextRef<'b>,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'b>> {
        async move {
            if let Some(link) = dependency_context.links.insert(
                link,
                Some(dependency_context.graph_resolve_depths.link_resolve_depth),
            ) {
                // Cloning/copying here avoids multiple borrow errors which would otherwise
                // require us to clone the Link
                let source_entity_id = link.inner().source_entity();
                let target_entity_id = link.inner().target_entity();
                let link_type_id = link.inner().link_type_id().clone();

                dependency_context.edges.insert(
                    GraphElementIdentifier::Temporary(LinkId {
                        source_entity_id,
                        target_entity_id,
                        link_type_id: link_type_id.clone(),
                    }),
                    OutwardEdge {
                        edge_kind: EdgeKind::HasType,
                        destination: GraphElementIdentifier::OntologyElementId(
                            link_type_id.clone(),
                        ),
                    },
                );

                if dependency_context
                    .graph_resolve_depths
                    .link_type_resolve_depth
                    > 0
                {
                    let link_type_id = link.inner().link_type_id().clone();
                    self.get_link_type_as_dependency(
                        &link_type_id,
                        dependency_context.change_depth(GraphResolveDepths {
                            link_type_resolve_depth: dependency_context
                                .graph_resolve_depths
                                .link_type_resolve_depth
                                - 1,
                            ..dependency_context.graph_resolve_depths
                        }),
                    )
                    .await?;
                }

                dependency_context.edges.insert(
                    GraphElementIdentifier::Temporary(LinkId {
                        source_entity_id,
                        target_entity_id,
                        link_type_id,
                    }),
                    OutwardEdge {
                        edge_kind: EdgeKind::HasDestination,
                        destination: GraphElementIdentifier::KnowledgeGraphElementId(
                            target_entity_id,
                        ),
                    },
                );

                if dependency_context
                    .graph_resolve_depths
                    .link_target_entity_resolve_depth
                    > 0
                {
                    self.get_entity_as_dependency(
                        target_entity_id,
                        dependency_context.change_depth(GraphResolveDepths {
                            link_target_entity_resolve_depth: dependency_context
                                .graph_resolve_depths
                                .link_target_entity_resolve_depth
                                - 1,
                            ..dependency_context.graph_resolve_depths
                        }),
                    )
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
        owned_by_id: OwnedById,
        created_by_id: CreatedById,
    ) -> Result<(), InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        transaction
            .insert_link(link, owned_by_id, created_by_id)
            .await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn get_links<'f: 'q, 'q>(
        &self,
        query: &'f NewStructuralQuery<'q, Link>,
    ) -> Result<Vec<LinkRootedSubgraph>, QueryError> {
        let NewStructuralQuery {
            ref filter,
            graph_resolve_depths,
        } = *query;

        stream::iter(Read::<PersistedLink>::read(self, filter).await?)
            .then(|link| async move {
                let mut dependency_context = DependencyContext::new(graph_resolve_depths);

                dependency_context.links.insert(&link, None);

                self.get_link_as_dependency(&link, dependency_context.as_ref_object())
                    .await?;

                let root = dependency_context
                    .links
                    .remove(&link)
                    .expect("root was not added to the subgraph");

                Ok(LinkRootedSubgraph {
                    link: root,
                    referenced_data_types: dependency_context.referenced_data_types.into_vec(),
                    referenced_property_types: dependency_context
                        .referenced_property_types
                        .into_vec(),
                    referenced_link_types: dependency_context.referenced_link_types.into_vec(),
                    referenced_entity_types: dependency_context.referenced_entity_types.into_vec(),
                    linked_entities: dependency_context.linked_entities.into_vec(),
                    links: dependency_context.links.into_vec(),
                })
            })
            .try_collect()
            .await
    }

    async fn remove_link(
        &mut self,
        link: &Link,
        removed_by_id: RemovedById,
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
