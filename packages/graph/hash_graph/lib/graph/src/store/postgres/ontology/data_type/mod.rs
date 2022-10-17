pub mod resolve;

use std::collections::HashMap;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, DataType};

use crate::{
    ontology::{AccountId, PersistedDataType, PersistedOntologyMetadata},
    store::{
        crud::Read,
        postgres::{
            context::PostgresContext, DependencyContext, DependencyMap, DependencySet,
            PersistedOntologyType,
        },
        AsClient, DataTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
    subgraph::{GraphElementIdentifier, StructuralQuery, Subgraph, Vertex},
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedDataType`] into a [`DependencyMap`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) async fn get_data_type_as_dependency(
        &self,
        data_type_id: &VersionedUri,
        context: DependencyContext<'_>,
    ) -> Result<(), QueryError> {
        let DependencyContext {
            referenced_data_types,
            graph_resolve_depths,
            ..
        } = context;

        let _unresolved_entity_type = referenced_data_types
            .insert(
                data_type_id,
                graph_resolve_depths.data_type_resolve_depth,
                || async {
                    Ok(PersistedDataType::from_record(
                        self.read_versioned_ontology_type(data_type_id).await?,
                    ))
                },
            )
            .await?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> DataTypeStore for PostgresStore<C> {
    async fn create_data_type(
        &mut self,
        data_type: DataType,
        owned_by_id: AccountId,
    ) -> Result<PersistedOntologyMetadata, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let (_, metadata) = transaction.create(data_type, owned_by_id).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(metadata)
    }

    async fn get_data_type(&self, query: &StructuralQuery) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref expression,
            graph_resolve_depths,
        } = *query;

        let roots_and_vertices =
            stream::iter(Read::<PersistedDataType>::read(self, expression).await?)
                .then(|data_type| async move {
                    let mut edges = HashMap::new();
                    let mut referenced_data_types = DependencyMap::new();
                    let mut referenced_property_types = DependencyMap::new();
                    let mut referenced_link_types = DependencyMap::new();
                    let mut referenced_entity_types = DependencyMap::new();
                    let mut linked_entities = DependencyMap::new();
                    let mut links = DependencySet::new();

                    self.get_data_type_as_dependency(
                        data_type.metadata.identifier().uri(),
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

                    let data_type = referenced_data_types
                        .remove(data_type.metadata.identifier().uri())
                        .expect("root was not added to the subgraph");

                    let identifier = GraphElementIdentifier::OntologyElementId(
                        data_type.metadata.identifier().uri().clone(),
                    );

                    Ok::<_, Report<QueryError>>((
                        identifier.clone(),
                        (identifier, Vertex::DataType(data_type)),
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

    async fn update_data_type(
        &mut self,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyMetadata, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        let (_, metadata) = transaction.update(data_type, updated_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(metadata)
    }
}
