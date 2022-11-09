use std::{collections::HashSet, future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, PropertyType};

use crate::{
    ontology::{OntologyElementMetadata, PropertyTypeWithMetadata},
    provenance::{CreatedById, OwnedById, UpdatedById},
    shared::identifier::GraphElementIdentifier,
    store::{
        crud::Read,
        postgres::{context::PostgresContext, DependencyContext, DependencyContextRef},
        AsClient, InsertionError, PostgresStore, PropertyTypeStore, QueryError, UpdateError,
    },
    subgraph::{EdgeKind, GraphResolveDepths, OutwardEdge, StructuralQuery, Subgraph},
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PropertyTypeWithMetadata`] into two [`DependencyContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_property_type_as_dependency<'a: 'b, 'b>(
        &'a self,
        property_type_id: &'b VersionedUri,
        mut dependency_context: DependencyContextRef<'b>,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'b>> {
        async move {
            let unresolved_property_type = dependency_context
                .referenced_property_types
                .insert_with(
                    property_type_id,
                    Some(
                        dependency_context
                            .graph_resolve_depths
                            .property_type_resolve_depth,
                    ),
                    || async {
                        Ok(PropertyTypeWithMetadata::from(
                            self.read_versioned_ontology_type(property_type_id).await?,
                        ))
                    },
                )
                .await?;

            if let Some(property_type) = unresolved_property_type.cloned() {
                // TODO: Use relation tables
                //   see https://app.asana.com/0/0/1202884883200942/f
                for data_type_ref in property_type.inner().data_type_references() {
                    dependency_context.edges.insert(
                        GraphElementIdentifier::OntologyElementId(property_type_id.clone()),
                        OutwardEdge {
                            edge_kind: EdgeKind::References,
                            destination: GraphElementIdentifier::OntologyElementId(
                                data_type_ref.uri().clone(),
                            ),
                        },
                    );
                    if dependency_context
                        .graph_resolve_depths
                        .data_type_resolve_depth
                        > 0
                    {
                        self.get_data_type_as_dependency(
                            data_type_ref.uri(),
                            dependency_context.change_depth(GraphResolveDepths {
                                data_type_resolve_depth: dependency_context
                                    .graph_resolve_depths
                                    .data_type_resolve_depth
                                    - 1,
                                ..dependency_context.graph_resolve_depths
                            }),
                        )
                        .await?;
                    }
                }

                // TODO: Use relation tables
                //   see https://app.asana.com/0/0/1202884883200942/f
                for property_type_ref in property_type.inner().property_type_references() {
                    dependency_context.edges.insert(
                        GraphElementIdentifier::OntologyElementId(property_type_id.clone()),
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
        // after as well. See `insert_property_type_references` taking `&property_type`
        let (version_id, metadata) = transaction
            .create(property_type.clone(), owned_by_id, created_by_id)
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

        Ok(metadata)
    }

    async fn get_property_type<'f: 'q, 'q>(
        &self,
        query: &'f StructuralQuery<'q, PropertyType>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
        } = *query;

        let subgraphs = stream::iter(Read::<PropertyTypeWithMetadata>::read(self, filter).await?)
            .then(|property_type| async move {
                let mut dependency_context = DependencyContext::new(graph_resolve_depths);

                let property_type_id = property_type.metadata().identifier().uri().clone();
                dependency_context.referenced_property_types.insert(
                    &property_type_id,
                    None,
                    property_type,
                );

                self.get_property_type_as_dependency(
                    &property_type_id,
                    dependency_context.as_ref_object(),
                )
                .await?;

                let root = GraphElementIdentifier::OntologyElementId(property_type_id);

                Ok::<_, Report<QueryError>>(dependency_context.into_subgraph(HashSet::from([root])))
            })
            .try_collect::<Vec<_>>()
            .await?;

        let mut subgraph = Subgraph::new(graph_resolve_depths);
        subgraph.extend(subgraphs);

        Ok(subgraph)
    }

    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
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
        // after as well. See `insert_property_type_references` taking `&property_type`
        let (version_id, metadata) = transaction
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

        Ok(metadata)
    }
}
