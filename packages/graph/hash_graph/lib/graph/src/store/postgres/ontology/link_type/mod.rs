mod resolve;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, LinkType};

use crate::{
    ontology::{PersistedLinkType, PersistedOntologyMetadata},
    provenance::{CreatedById, OwnedById, UpdatedById},
    shared::identifier::GraphElementIdentifier,
    store::{
        crud::Read,
        postgres::{context::PostgresContext, DependencyContext, DependencyContextRef},
        AsClient, InsertionError, LinkTypeStore, PostgresStore, QueryError, UpdateError,
    },
    subgraph::{NewStructuralQuery, Subgraph},
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
                    Ok(PersistedLinkType::from(
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
        owned_by_id: OwnedById,
        created_by_id: CreatedById,
    ) -> Result<PersistedOntologyMetadata, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let (_, metadata) = transaction
            .create(link_type, owned_by_id, created_by_id)
            .await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(metadata)
    }

    async fn get_link_type<'f: 'q, 'q>(
        &self,
        query: &'f NewStructuralQuery<'q, LinkType>,
    ) -> Result<Subgraph, QueryError> {
        let NewStructuralQuery {
            ref filter,
            graph_resolve_depths,
        } = *query;

        let subgraphs = stream::iter(Read::<PersistedLinkType>::read(self, filter).await?)
            .then(|link_type| async move {
                let mut dependency_context = DependencyContext::new(graph_resolve_depths);

                let link_type_id = link_type.metadata().identifier().uri().clone();
                dependency_context
                    .referenced_link_types
                    .insert(&link_type_id, None, link_type);

                self.get_link_type_as_dependency(&link_type_id, dependency_context.as_ref_object())
                    .await?;

                let root = GraphElementIdentifier::OntologyElementId(link_type_id);

                Ok::<_, Report<QueryError>>(dependency_context.into_subgraph(vec![root]))
            })
            .try_collect::<Vec<_>>()
            .await?;

        let mut subgraph = Subgraph::new(graph_resolve_depths);
        subgraph.extend(subgraphs);

        Ok(subgraph)
    }

    async fn update_link_type(
        &mut self,
        link_type: LinkType,
        updated_by: UpdatedById,
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
