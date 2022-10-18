mod resolve;

use std::{collections::HashMap, future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, PropertyType};

use crate::{
    ontology::{AccountId, PersistedOntologyMetadata, PersistedPropertyType},
    store::{
        crud::Read,
        postgres::{
            context::PostgresContext, DependencyContext, DependencyContextRef,
            PersistedOntologyType,
        },
        AsClient, InsertionError, PostgresStore, PropertyTypeStore, QueryError, UpdateError,
    },
    subgraph::{
        EdgeKind, Edges, GraphElementIdentifier, GraphResolveDepths, OutwardEdge, StructuralQuery,
        Subgraph, Vertex,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedPropertyType`] into two [`DependencyMap`]s.
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
                .insert(
                    property_type_id,
                    dependency_context
                        .graph_resolve_depths
                        .property_type_resolve_depth,
                    || async {
                        Ok(PersistedPropertyType::from_record(
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
        // after as well. See `insert_property_type_references` taking `&property_type`
        let (version_id, metadata) = transaction
            .create(property_type.clone(), owned_by_id)
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

    async fn get_property_type(&self, query: &StructuralQuery) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref expression,
            graph_resolve_depths,
        } = *query;

        let dependencies =
            stream::iter(Read::<PersistedPropertyType>::read(self, expression).await?)
                .then(|property_type| async move {
                    let mut dependency_context = DependencyContext::new(graph_resolve_depths);

                    self.get_property_type_as_dependency(
                        property_type.metadata().identifier().uri(),
                        dependency_context.as_ref_object(),
                    )
                    .await?;

                    let property_type = dependency_context
                        .referenced_property_types
                        .remove(property_type.metadata().identifier().uri())
                        .expect("root was not added to the subgraph");

                    let identifier = GraphElementIdentifier::OntologyElementId(
                        property_type.metadata().identifier().uri().clone(),
                    );

                    Ok::<_, Report<QueryError>>((
                        identifier.clone(),
                        Vertex::PropertyType(property_type),
                        dependency_context.edges,
                    ))
                })
                .try_collect::<Vec<_>>()
                .await?;

        let mut edges = Edges::new();
        let mut vertices = HashMap::with_capacity(dependencies.len());
        let mut roots = Vec::with_capacity(dependencies.len());

        for (identifier, vertex, dependency_edges) in dependencies {
            roots.push(identifier.clone());
            vertices.insert(identifier, vertex);
            edges.extend(dependency_edges.into_iter());
        }

        Ok(Subgraph {
            roots,
            vertices,
            edges,
            depths: graph_resolve_depths,
        })
    }

    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
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
