use std::{future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, EntityType, EntityTypeReference};

use crate::{
    ontology::{PersistedEntityType, PersistedOntologyMetadata},
    provenance::{CreatedById, OwnedById, UpdatedById},
    shared::identifier::GraphElementIdentifier,
    store::{
        crud::Read,
        postgres::{context::PostgresContext, DependencyContext, DependencyContextRef},
        AsClient, EntityTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
    subgraph::{EdgeKind, GraphResolveDepths, OutwardEdge, StructuralQuery, Subgraph},
};

impl<C: AsClient> PostgresStore<C> {
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
                        Ok(PersistedEntityType::from(
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

                let entity_type_ids = entity_type
                    .inner()
                    .link_mappings()
                    .into_keys()
                    .chain(
                        entity_type
                            .inner()
                            .link_mappings()
                            .into_values()
                            .flatten()
                            .flatten(),
                    )
                    .chain(entity_type.inner().inherits_from().all_of())
                    .map(EntityTypeReference::uri);

                // TODO: Use relation tables
                //   see https://app.asana.com/0/0/1202884883200942/f
                for entity_type_id in entity_type_ids {
                    dependency_context.edges.insert(
                        GraphElementIdentifier::OntologyElementId(entity_type_id.clone()),
                        OutwardEdge {
                            edge_kind: EdgeKind::References,
                            destination: GraphElementIdentifier::OntologyElementId(
                                entity_type_id.clone(),
                            ),
                        },
                    );

                    if dependency_context
                        .graph_resolve_depths
                        .entity_type_resolve_depth
                        > 0
                    {
                        self.get_entity_type_as_dependency(
                            entity_type_id,
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

    async fn get_entity_type<'f: 'q, 'q>(
        &self,
        query: &'f StructuralQuery<'q, EntityType>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
        } = *query;

        let subgraphs = stream::iter(Read::<PersistedEntityType>::read(self, filter).await?)
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
        updated_by: UpdatedById,
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
