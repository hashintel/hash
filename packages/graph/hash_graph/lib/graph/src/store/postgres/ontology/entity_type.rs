use std::{collections::HashSet, future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::EntityType;

use crate::{
    identifier::ontology::OntologyTypeEditionId,
    ontology::{EntityTypeWithMetadata, OntologyElementMetadata},
    provenance::{CreatedById, OwnedById, UpdatedById},
    shared::{
        identifier::GraphElementEditionId,
        subgraph::{depths::GraphResolveDepths, query::StructuralQuery},
    },
    store::{
        crud::Read,
        postgres::{context::PostgresContext, DependencyContext, DependencyContextRef},
        AsClient, EntityTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
    subgraph::{
        edges::{Edge, OntologyEdgeKind, OntologyOutwardEdges, OutwardEdge},
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`EntityTypeWithMetadata`] into four [`DependencyContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_entity_type_as_dependency<'a: 'b, 'b>(
        &'a self,
        entity_type_id: &'a OntologyTypeEditionId,
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
                        Ok(EntityTypeWithMetadata::from(
                            self.read_versioned_ontology_type(entity_type_id).await?,
                        ))
                    },
                )
                .await?;

            if let Some(entity_type) = unresolved_entity_type.cloned() {
                for property_type_ref in entity_type.inner().property_type_references() {
                    if dependency_context
                        .graph_resolve_depths
                        .property_type_resolve_depth
                        > 0
                    {
                        // TODO: Use relation tables
                        //   see https://app.asana.com/0/0/1202884883200942/f
                        self.get_property_type_as_dependency(
                            // We have to clone here because we can't call `Into` on the ref
                            &property_type_ref.uri().clone().into(),
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

                    dependency_context.edges.insert(Edge::Ontology {
                        edition_id: entity_type_id.clone(),
                        edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                            kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                            reversed: false,
                            right_endpoint: property_type_ref.uri().clone().into(),
                        }),
                    });
                }

                let parent_entity_type_ids = entity_type
                    .inner()
                    .inherits_from()
                    .all_of()
                    .iter()
                    .map(|reference| OntologyTypeEditionId::from(reference.uri().clone()));

                // TODO: Use structural queries or add multiple reference table and use these
                //   see https://app.asana.com/0/0/1202884883200942/f

                self.resolve_dependency_with_edge_kind(
                    &mut dependency_context,
                    entity_type_id.clone(),
                    parent_entity_type_ids,
                    OntologyEdgeKind::InheritsFrom,
                )
                .await?;

                let link_entity_type_ids = entity_type
                    .inner()
                    .link_mappings()
                    .into_keys()
                    .map(|reference| OntologyTypeEditionId::from(reference.uri().clone()));

                self.resolve_dependency_with_edge_kind(
                    &mut dependency_context,
                    entity_type_id.clone(),
                    link_entity_type_ids,
                    OntologyEdgeKind::ConstrainsLinksOn,
                )
                .await?;

                // `flatten`s are used to flatten `Option<[EntityTypeReference]>`
                let link_destination_entity_type_ids = entity_type
                    .inner()
                    .link_mappings()
                    .into_values()
                    .flatten()
                    .flatten()
                    .map(|reference| OntologyTypeEditionId::from(reference.uri().clone()));

                self.resolve_dependency_with_edge_kind(
                    &mut dependency_context,
                    entity_type_id.clone(),
                    link_destination_entity_type_ids,
                    OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                )
                .await?;
            }

            Ok(())
        }
        .boxed()
    }

    async fn resolve_dependency_with_edge_kind<'a: 'b, 'b: 'c, 'c>(
        &'a self,
        dependency_context: &'c mut DependencyContextRef<'b>,
        source_entity_type_id: OntologyTypeEditionId,
        dependent_entity_type_ids: impl Iterator<Item = OntologyTypeEditionId> + Send,
        edge_kind: OntologyEdgeKind,
    ) -> Result<(), QueryError> {
        for dependent_entity_type_id in dependent_entity_type_ids {
            dependency_context.edges.insert(Edge::Ontology {
                edition_id: source_entity_type_id.clone(),
                edge: OntologyOutwardEdges::ToOntology(OutwardEdge {
                    kind: edge_kind,
                    reversed: false,
                    right_endpoint: dependent_entity_type_id.clone(),
                }),
            });

            if dependency_context
                .graph_resolve_depths
                .entity_type_resolve_depth
                > 0
            {
                self.get_entity_type_as_dependency(
                    &dependent_entity_type_id,
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

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> EntityTypeStore for PostgresStore<C> {
    async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
        owned_by_id: OwnedById,
        created_by_id: CreatedById,
    ) -> Result<OntologyElementMetadata, InsertionError> {
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

        let subgraphs = stream::iter(Read::<EntityTypeWithMetadata>::read(self, filter).await?)
            .then(|entity_type| async move {
                let mut dependency_context = DependencyContext::new(graph_resolve_depths);

                let entity_type_id = entity_type.metadata().edition_id().clone();
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

                let root = GraphElementEditionId::Ontology(entity_type_id);

                Ok::<_, Report<QueryError>>(dependency_context.into_subgraph(HashSet::from([root])))
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
    ) -> Result<OntologyElementMetadata, UpdateError> {
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
