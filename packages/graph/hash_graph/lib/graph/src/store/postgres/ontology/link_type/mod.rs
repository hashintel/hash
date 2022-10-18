mod resolve;

use std::collections::HashMap;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, LinkType};

use crate::{
    ontology::{AccountId, LinkTypeRootedSubgraph, PersistedLinkType, PersistedOntologyMetadata},
    store::{
        crud::Read,
        postgres::{
            context::PostgresContext, DependencyContext, DependencyMap, DependencySet,
            PersistedOntologyType,
        },
        AsClient, InsertionError, LinkTypeStore, PostgresStore, QueryError, UpdateError,
    },
    subgraph::StructuralQuery,
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedLinkType`] into a [`DependencyMap`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) async fn get_link_type_as_dependency(
        &self,
        link_type_id: &VersionedUri,
        context: DependencyContext<'_>,
    ) -> Result<(), QueryError> {
        let _unresolved_link_type = context
            .referenced_link_types
            .insert(
                link_type_id,
                context.graph_resolve_depths.link_type_resolve_depth,
                || async {
                    Ok(PersistedLinkType::from_record(
                        self.read_versioned_ontology_type(link_type_id).await?,
                    ))
                },
            )
            .await?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> LinkTypeStore for PostgresStore<C> {
    async fn create_link_type(
        &mut self,
        link_type: LinkType,
        owned_by_id: AccountId,
    ) -> Result<PersistedOntologyMetadata, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let (_, metadata) = transaction.create(link_type, owned_by_id).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(metadata)
    }

    async fn get_link_type(
        &self,
        query: &StructuralQuery,
    ) -> Result<Vec<LinkTypeRootedSubgraph>, QueryError> {
        let StructuralQuery {
            ref expression,
            graph_resolve_depths,
        } = *query;

        stream::iter(Read::<PersistedLinkType>::read(self, expression).await?)
            .then(|link_type| async move {
                let mut edges = HashMap::new();
                let mut referenced_data_types = DependencyMap::new();
                let mut referenced_property_types = DependencyMap::new();
                let mut referenced_link_types = DependencyMap::new();
                let mut referenced_entity_types = DependencyMap::new();
                let mut linked_entities = DependencyMap::new();
                let mut links = DependencySet::new();

                self.get_link_type_as_dependency(
                    link_type.metadata().identifier().uri(),
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

                let root = referenced_link_types
                    .remove(link_type.metadata().identifier().uri())
                    .expect("root was not added to the subgraph");

                Ok(LinkTypeRootedSubgraph { link_type: root })
            })
            .try_collect()
            .await
    }

    async fn update_link_type(
        &mut self,
        link_type: LinkType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyMetadata, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        let (_, metadata) = transaction.update(link_type, updated_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(metadata)
    }
}
