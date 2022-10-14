mod resolve;

use std::{collections::HashMap, future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, PropertyType, PropertyTypeReference};

use crate::{
    ontology::{AccountId, PersistedOntologyMetadata, PersistedPropertyType, StructuralQuery},
    store::{
        crud::Read,
        postgres::{
            context::PostgresContext, DependencyContext, DependencyMap, DependencySet,
            PersistedOntologyType,
        },
        AsClient, InsertionError, PostgresStore, PropertyTypeStore, QueryError, UpdateError,
    },
    subgraph::{GraphElementIdentifier, GraphResolveDepths, Subgraph, Vertex},
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedPropertyType`] into two [`DependencyMap`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_property_type_as_dependency<'a>(
        &'a self,
        property_type_id: &'a VersionedUri,
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
            let unresolved_property_type = referenced_property_types
                .insert(
                    property_type_id,
                    graph_resolve_depths.property_type_resolve_depth,
                    || async {
                        Ok(PersistedPropertyType::from_record(
                            self.read_versioned_ontology_type(property_type_id).await?,
                        ))
                    },
                )
                .await?;

            if let Some(property_type) = unresolved_property_type.cloned() {
                if graph_resolve_depths.data_type_resolve_depth > 0 {
                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    for data_type_ref in property_type.inner.data_type_references() {
                        self.get_data_type_as_dependency(data_type_ref.uri(), DependencyContext {
                            graph_resolve_depths: GraphResolveDepths {
                                data_type_resolve_depth: graph_resolve_depths
                                    .data_type_resolve_depth
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
                }

                if context.graph_resolve_depths.property_type_resolve_depth > 0 {
                    // TODO: Use relation tables
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    let property_type_ids = property_type
                        .inner
                        .property_type_references()
                        .into_iter()
                        .map(PropertyTypeReference::uri)
                        .cloned()
                        .collect::<Vec<_>>();

                    for property_type_id in property_type_ids {
                        self.get_property_type_as_dependency(
                            &property_type_id,
                            DependencyContext {
                                graph_resolve_depths: GraphResolveDepths {
                                    property_type_resolve_depth: graph_resolve_depths
                                        .property_type_resolve_depth
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

        let roots_and_vertices =
            stream::iter(Read::<PersistedPropertyType>::read(self, expression).await?)
                .then(|property_type| async move {
                    let mut edges = HashMap::new();
                    let mut referenced_data_types = DependencyMap::new();
                    let mut referenced_property_types = DependencyMap::new();
                    let mut referenced_link_types = DependencyMap::new();
                    let mut referenced_entity_types = DependencyMap::new();
                    let mut linked_entities = DependencyMap::new();
                    let mut links = DependencySet::new();

                    self.get_property_type_as_dependency(
                        property_type.metadata.identifier().uri(),
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

                    let property_type = referenced_property_types
                        .remove(property_type.metadata.identifier().uri())
                        .expect("root was not added to the subgraph");

                    let identifier = GraphElementIdentifier::OntologyElementId(
                        property_type.metadata.identifier().uri().clone(),
                    );

                    Ok::<_, Report<QueryError>>((
                        identifier.clone(),
                        (identifier, Vertex::PropertyType(property_type)),
                    ))
                })
                .try_collect::<Vec<_>>()
                .await?;

        let (roots, vertices) = roots_and_vertices.into_iter().unzip();

        Ok(Subgraph {
            roots,
            vertices,
            // TODO - we need to update the `DependencyMap` mechanism to collect these
            //  https://app.asana.com/0/1203007126736604/1203160580911226/f
            edges: HashMap::new(),
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
