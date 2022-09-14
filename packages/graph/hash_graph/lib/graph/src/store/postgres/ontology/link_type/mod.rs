mod resolve;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, LinkType};

use crate::{
    ontology::{
        AccountId, LinkTypeQuery, LinkTypeRootedSubgraph, PersistedLinkType,
        PersistedOntologyIdentifier, QueryDepth,
    },
    store::{
        crud::Read,
        postgres::{context::PostgresContext, DependencyMap, PersistedOntologyType},
        AsClient, InsertionError, LinkTypeStore, PostgresStore, QueryError, UpdateError,
    },
};

pub struct LinkTypeDependencyContext<'a> {
    pub link_type_references: &'a mut DependencyMap<VersionedUri, PersistedLinkType>,
    // `link_type_query_depth` is unused as link types do not reference other link types
    pub link_type_query_depth: QueryDepth,
}

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedLinkType`] into a [`DependencyMap`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) async fn get_link_type_as_dependency(
        &self,
        link_type_uri: &VersionedUri,
        context: LinkTypeDependencyContext<'_>,
    ) -> Result<(), QueryError> {
        let LinkTypeDependencyContext {
            link_type_references,
            link_type_query_depth,
        } = context;

        let _unresolved_link_type = link_type_references
            .insert(link_type_uri, link_type_query_depth, || async {
                Ok(PersistedLinkType::from_record(
                    self.read_versioned_ontology_type(link_type_uri).await?,
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
        created_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let (_, identifier) = transaction.create(link_type, created_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(identifier)
    }

    async fn get_link_type(
        &self,
        query: &LinkTypeQuery,
    ) -> Result<Vec<LinkTypeRootedSubgraph>, QueryError> {
        let LinkTypeQuery { ref expression } = *query;

        stream::iter(Read::<PersistedLinkType>::read(self, expression).await?)
            .then(|link_type: PersistedLinkType| async { Ok(LinkTypeRootedSubgraph { link_type }) })
            .try_collect()
            .await
    }

    async fn update_link_type(
        &mut self,
        link_type: LinkType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        let (_, identifier) = transaction.update(link_type, updated_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(identifier)
    }
}
