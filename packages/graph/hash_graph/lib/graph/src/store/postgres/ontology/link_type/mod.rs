mod resolve;

use std::collections::{hash_map::Entry, HashMap};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, LinkType};

use crate::{
    ontology::{
        AccountId, LinkTypeQuery, LinkTypeRootedSubgraph, PersistedLinkType,
        PersistedOntologyIdentifier,
    },
    store::{
        crud::Read,
        postgres::{context::PostgresContext, PersistedOntologyType},
        AsClient, InsertionError, LinkTypeStore, PostgresStore, QueryError, UpdateError,
    },
};

pub struct LinkTypeDependencyContext<'a> {
    pub link_type_references: &'a mut HashMap<VersionedUri, PersistedLinkType>,
    // `_link_type_query_depth` is unused as link types do not reference other link types
    pub _link_type_query_depth: u8,
}

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedLinkType`] into a [`HashMap`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) async fn get_link_type_as_dependency(
        &self,
        link_type_uri: VersionedUri,
        context: LinkTypeDependencyContext<'_>,
    ) -> Result<(), QueryError> {
        let LinkTypeDependencyContext {
            link_type_references,
            ..
        } = context;

        // TODO: Use relation tables
        //   see https://app.asana.com/0/0/1202884883200942/f
        if let Entry::Vacant(entry) = link_type_references.entry(link_type_uri) {
            let link_type = PersistedLinkType::from_record(
                self.read_versioned_ontology_type::<LinkType>(entry.key())
                    .await?,
            );
            entry.insert(link_type);
        }
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
