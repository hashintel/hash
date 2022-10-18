mod resolve;

use std::{future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, EntityType};

use crate::{
    ontology::{
        AccountId, EntityTypeRootedSubgraph, PersistedEntityType, PersistedOntologyMetadata,
    },
    store::{
        crud::Read,
        postgres::{
            context::PostgresContext, DependencyContext, DependencyMap, DependencySet, Edges,
            PersistedOntologyType,
        },
        AsClient, EntityTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
    subgraph::{GraphResolveDepths, StructuralQuery},
};

impl<C: AsClient> PostgresStore<C> {
    #[expect(
        clippy::too_many_lines,
        reason = "difficult to shrink the number of lines with destructuring and so many \
                  variables needing to be passed independently"
    )]
    /// Internal method to read a [`PersistedEntityType`] into four [`DependencyMap`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_entity_type_as_dependency<'a>(
        &'a self,
        entity_type_id: &'a VersionedUri,
        context: DependencyContext<'a>,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        let DependencyContext {
            edges,
            referenced_data_types,
            referenced_property_types,
            referenced_link_types,
            referenced_entity_types,
            linked_entities,
            links,
            graph_resolve_depths,
        } = context;

        async move {
            let unresolved_entity_type = referenced_entity_types
                .insert(
                    entity_type_id,
                    graph_resolve_depths.entity_type_resolve_depth,
                    || async {
                        Ok(PersistedEntityType::from_record(
                            self.read_versioned_ontology_type(entity_type_id).await?,
                        ))
                    },
                )
                .await?;

            if let Some(entity_type) = unresolved_entity_type.cloned() {
                if graph_resolve_depths.property_type_resolve_depth > 0 {
                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    for property_type_ref in entity_type.inner().property_type_references() {
                        self.get_property_type_as_dependency(
                            property_type_ref.uri(),
                            DependencyContext {
                                edges,
                                referenced_data_types,
                                referenced_property_types,
                                referenced_link_types,
                                referenced_entity_types,
                                linked_entities,
                                links,
                                graph_resolve_depths: GraphResolveDepths {
                                    property_type_resolve_depth: graph_resolve_depths
                                        .property_type_resolve_depth
                                        - 1,
                                    ..graph_resolve_depths
                                },
                            },
                        )
                        .await?;
                    }
                }

                if context.graph_resolve_depths.link_type_resolve_depth > 0
                    || context.graph_resolve_depths.entity_type_resolve_depth > 0
                {
                    let linked_uris = entity_type
                        .inner()
                        .link_type_references()
                        .into_iter()
                        .map(|(link_type_id, entity_type_ids)| {
                            (
                                link_type_id.clone(),
                                entity_type_ids
                                    .iter()
                                    .map(|reference| reference.uri().clone())
                                    .collect::<Vec<_>>(),
                            )
                        })
                        .collect::<Vec<_>>();

                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    for (link_type_id, entity_type_ids) in linked_uris {
                        if graph_resolve_depths.link_type_resolve_depth > 0 {
                            self.get_link_type_as_dependency(&link_type_id, DependencyContext {
                                graph_resolve_depths: GraphResolveDepths {
                                    link_type_resolve_depth: graph_resolve_depths
                                        .link_type_resolve_depth
                                        - 1,
                                    ..graph_resolve_depths
                                },
                                edges,
                                referenced_data_types,
                                referenced_property_types,
                                referenced_link_types,
                                referenced_entity_types,
                                linked_entities,
                                links,
                            })
                            .await?;
                        }
                        if context.graph_resolve_depths.entity_type_resolve_depth > 0 {
                            for entity_type_id in entity_type_ids {
                                self.get_entity_type_as_dependency(
                                    &entity_type_id,
                                    DependencyContext {
                                        graph_resolve_depths: GraphResolveDepths {
                                            entity_type_resolve_depth: graph_resolve_depths
                                                .entity_type_resolve_depth
                                                - 1,
                                            ..graph_resolve_depths
                                        },
                                        edges,
                                        referenced_data_types,
                                        referenced_property_types,
                                        referenced_link_types,
                                        referenced_entity_types,
                                        linked_entities,
                                        links,
                                    },
                                )
                                .await?;
                            }
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
    ) -> Result<PersistedOntologyMetadata, InsertionError> {
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
        let (version_id, metadata) = transaction.create(entity_type.clone(), owned_by_id).await?;

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

        Ok(metadata)
    }

    async fn get_entity_type(
        &self,
        query: &StructuralQuery,
    ) -> Result<Vec<EntityTypeRootedSubgraph>, QueryError> {
        let StructuralQuery {
            ref expression,
            graph_resolve_depths,
        } = *query;

        stream::iter(Read::<PersistedEntityType>::read(self, expression).await?)
            .then(|entity_type| async move {
                let mut edges = Edges::new();
                let mut referenced_data_types = DependencyMap::new();
                let mut referenced_property_types = DependencyMap::new();
                let mut referenced_link_types = DependencyMap::new();
                let mut referenced_entity_types = DependencyMap::new();
                let mut linked_entities = DependencyMap::new();
                let mut links = DependencySet::new();

                self.get_entity_type_as_dependency(
                    entity_type.metadata().identifier().uri(),
                    DependencyContext {
                        edges: &mut edges,
                        referenced_data_types: &mut referenced_data_types,
                        referenced_property_types: &mut referenced_property_types,
                        referenced_link_types: &mut referenced_link_types,
                        referenced_entity_types: &mut referenced_entity_types,
                        linked_entities: &mut linked_entities,
                        links: &mut links,
                        graph_resolve_depths,
                    },
                )
                .await?;

                let root = referenced_entity_types
                    .remove(entity_type.metadata().identifier().uri())
                    .expect("root was not added to the subgraph");

                Ok(EntityTypeRootedSubgraph {
                    entity_type: root,
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
    ) -> Result<PersistedOntologyMetadata, UpdateError> {
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
        let (version_id, metadata) = transaction.update(entity_type.clone(), updated_by).await?;

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

        Ok(metadata)
    }
}
