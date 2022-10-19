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
            context::PostgresContext, DependencyContext, DependencyContextRef,
            PersistedOntologyType,
        },
        AsClient, DataTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
    subgraph::{Edges, GraphElementIdentifier, StructuralQuery, Subgraph, Vertex},
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedDataType`] into a [`DependencyContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) async fn get_data_type_as_dependency(
        &self,
        data_type_id: &VersionedUri,
        context: DependencyContextRef<'_>,
    ) -> Result<(), QueryError> {
        let DependencyContextRef {
            referenced_data_types,
            graph_resolve_depths,
            ..
        } = context;

        let _unresolved_entity_type = referenced_data_types
            .insert_with(
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

        let dependencies = stream::iter(Read::<PersistedDataType>::read(self, expression).await?)
            .then(|data_type| async move {
                let mut dependency_context = DependencyContext::new(graph_resolve_depths);

                let data_type_id = data_type.metadata().identifier().uri().clone();
                dependency_context.referenced_data_types.insert(
                    &data_type_id,
                    dependency_context
                        .graph_resolve_depths
                        .data_type_resolve_depth,
                    data_type,
                );

                self.get_data_type_as_dependency(&data_type_id, dependency_context.as_ref_object())
                    .await?;

                let data_type = dependency_context
                    .referenced_data_types
                    .remove(&data_type_id)
                    .expect("root was not added to the subgraph");

                let identifier = GraphElementIdentifier::OntologyElementId(
                    data_type.metadata().identifier().uri().clone(),
                );

                Ok::<_, Report<QueryError>>((
                    identifier,
                    Vertex::DataType(data_type),
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
