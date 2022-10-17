mod resolve;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, LinkType};

use crate::{
    ontology::{
        AccountId, LinkTypeQuery, LinkTypeRootedSubgraph, OntologyQueryDepth, PersistedLinkType,
        PersistedOntologyMetadata,
    },
    store::{
        crud::Read,
        postgres::{context::PostgresContext, DependencyMap, PersistedOntologyType},
        AsClient, InsertionError, LinkTypeStore, PostgresStore, QueryError, UpdateError,
    },
};

pub struct LinkTypeDependencyContext<'a> {
    pub referenced_link_types:
        &'a mut DependencyMap<VersionedUri, PersistedLinkType, OntologyQueryDepth>,
    // `link_type_query_depth` is unused as link types do not reference other link types
    pub link_type_query_depth: OntologyQueryDepth,
}

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedLinkType`] into a [`DependencyMap`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) async fn get_link_type_as_dependency(
        &self,
        link_type_id: &VersionedUri,
        context: LinkTypeDependencyContext<'_>,
    ) -> Result<(), QueryError> {
        let LinkTypeDependencyContext {
            referenced_link_types,
            link_type_query_depth,
        } = context;

        let _unresolved_link_type = referenced_link_types
            .insert(link_type_id, link_type_query_depth, || async {
                Ok(PersistedLinkType::from_record(
                    self.read_versioned_ontology_type(link_type_id).await?,
                ))
            })
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
        query: &LinkTypeQuery,
    ) -> Result<Vec<LinkTypeRootedSubgraph>, QueryError> {
        let LinkTypeQuery { ref expression } = *query;

        stream::iter(Read::<PersistedLinkType>::read(self, expression).await?)
            .then(|link_type| async move {
                let mut referenced_link_types = DependencyMap::new();

                self.get_link_type_as_dependency(
                    link_type.metadata.identifier().uri(),
                    LinkTypeDependencyContext {
                        referenced_link_types: &mut referenced_link_types,
                        link_type_query_depth: 0,
                    },
                )
                .await?;

                let root = referenced_link_types
                    .remove(link_type.metadata.identifier().uri())
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
