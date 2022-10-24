mod resolve;

use std::{future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, EntityType};

use crate::{
    ontology::{AccountId, PersistedEntityType, PersistedOntologyMetadata},
    shared::identifier::GraphElementIdentifier,
    store::{
        crud::Read,
        postgres::{
            context::PostgresContext, DependencyContext, DependencyContextRef,
            PersistedOntologyType,
        },
        AsClient, EntityTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
    subgraph::{EdgeKind, GraphResolveDepths, OutwardEdge, StructuralQuery, Subgraph},
};

impl<C: AsClient> PostgresStore<C> {
    #[expect(
        clippy::too_many_lines,
        reason = "difficult to shrink the number of lines with destructuring and so many \
                  variables needing to be passed independently"
    )]
    /// Internal method to read a [`PersistedEntityType`] into four [`DependencyContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_entity_type_as_dependency<'a: 'b, 'b>(
        &'a self,
        entity_type_id: &'a VersionedUri,
        mut dependency_context: DependencyContextRef<'b>,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'b>> {
        async move {
            let unresolved_entity_type = dependency_context
                .referenced_entity_types
                .insert_with(
                    entity_type_id,
                    Some(
                        dependency_context
                            .graph_resolve_depths
                            .entity_type_resolve_depth,
                    ),
                    || async {
                        Ok(PersistedEntityType::from_record(
                            self.read_versioned_ontology_type(entity_type_id).await?,
                        ))
                    },
                )
                .await?;

            if let Some(entity_type) = unresolved_entity_type.cloned() {
                for property_type_ref in entity_type.inner().property_type_references() {
                    dependency_context.edges.insert(
                        GraphElementIdentifier::OntologyElementId(entity_type_id.clone()),
                        OutwardEdge {
                            edge_kind: EdgeKind::References,
                            destination: GraphElementIdentifier::OntologyElementId(
                                property_type_ref.uri().clone(),
                            ),
                        },
                    );

                    if dependency_context
                        .graph_resolve_depths
                        .property_type_resolve_depth
                        > 0
                    {
                        // TODO: Use relation tables
                        //   see https://app.asana.com/0/0/1202884883200942/f
                        self.get_property_type_as_dependency(
                            property_type_ref.uri(),
                            dependency_context.change_depth(GraphResolveDepths {
                                property_type_resolve_depth: dependency_context
                                    .graph_resolve_depths
                                    .property_type_resolve_depth
                                    - 1,
                                ..dependency_context.graph_resolve_depths
                            }),
                        )
                        .await?;
                    }
                }

                // TODO: Use relation tables
                //   see https://app.asana.com/0/0/1202884883200942/f
                for (link_type_id, entity_type_ids) in entity_type.inner().link_type_references() {
                    dependency_context.edges.insert(
                        GraphElementIdentifier::OntologyElementId(entity_type_id.clone()),
                        OutwardEdge {
                            edge_kind: EdgeKind::References,
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
                        self.get_link_type_as_dependency(
                            link_type_id,
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
                    for referenced_entity_type_id in entity_type_ids {
                        dependency_context.edges.insert(
                            GraphElementIdentifier::OntologyElementId(entity_type_id.clone()),
                            OutwardEdge {
                                edge_kind: EdgeKind::References,
                                destination: GraphElementIdentifier::OntologyElementId(
                                    referenced_entity_type_id.uri().clone(),
                                ),
                            },
                        );

                        if dependency_context
                            .graph_resolve_depths
                            .entity_type_resolve_depth
                            > 0
                        {
                            self.get_entity_type_as_dependency(
                                referenced_entity_type_id.uri(),
                                dependency_context.change_depth(GraphResolveDepths {
                                    entity_type_resolve_depth: dependency_context
                                        .graph_resolve_depths
                                        .entity_type_resolve_depth
                                        - 1,
                                    ..dependency_context.graph_resolve_depths
                                }),
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
        created_by_id: AccountId,
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
        let (version_id, metadata) = transaction
            .create(entity_type.clone(), owned_by_id, created_by_id)
            .await?;

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

    async fn get_entity_type(&self, query: &StructuralQuery) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref expression,
            graph_resolve_depths,
        } = *query;

        let subgraphs = stream::iter(Read::<PersistedEntityType>::read(self, expression).await?)
            .then(|entity_type| async move {
                let mut dependency_context = DependencyContext::new(graph_resolve_depths);

                let entity_type_id = entity_type.metadata().identifier().uri().clone();
                dependency_context.referenced_entity_types.insert(
                    &entity_type_id,
                    None,
                    entity_type,
                );

                self.get_entity_type_as_dependency(
                    &entity_type_id,
                    dependency_context.as_ref_object(),
                )
                .await?;

                let root = GraphElementIdentifier::OntologyElementId(entity_type_id);

                Ok::<_, Report<QueryError>>(dependency_context.into_subgraph(vec![root]))
            })
            .try_collect::<Vec<_>>()
            .await?;

        let mut subgraph = Subgraph::new(graph_resolve_depths);
        subgraph.extend(subgraphs);

        Ok(subgraph)
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
