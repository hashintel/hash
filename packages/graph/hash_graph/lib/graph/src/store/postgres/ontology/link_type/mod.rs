mod resolve;

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
            context::PostgresContext, DependencyContext, DependencyContextRef,
            PersistedOntologyType,
        },
        AsClient, InsertionError, LinkTypeStore, PostgresStore, QueryError, UpdateError,
    },
    subgraph::StructuralQuery,
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read a [`PersistedLinkType`] into a [`DependencyContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) async fn get_link_type_as_dependency<'a>(
        &self,
        link_type_id: &VersionedUri,
        context: DependencyContextRef<'a>,
    ) -> Result<(), QueryError> {
        let _unresolved_link_type = context
            .referenced_link_types
            .insert_with(
                link_type_id,
                Some(context.graph_resolve_depths.link_type_resolve_depth),
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
                let mut dependency_context = DependencyContext::new(graph_resolve_depths);

                let link_type_id = link_type.metadata().identifier().uri().clone();
                dependency_context
                    .referenced_link_types
                    .insert(&link_type_id, None, link_type);

                self.get_link_type_as_dependency(&link_type_id, dependency_context.as_ref_object())
                    .await?;

                let root = dependency_context
                    .referenced_link_types
                    .remove(&link_type_id)
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
