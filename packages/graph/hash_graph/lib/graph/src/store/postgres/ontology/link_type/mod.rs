mod read;

use async_trait::async_trait;
use error_stack::{bail, IntoReport, Report, Result, ResultExt};
use futures::TryStreamExt;
use tokio_postgres::GenericClient;
use type_system::LinkType;

use crate::{
    ontology::{AccountId, PersistedLinkType, PersistedOntologyIdentifier},
    store::{
        crud::Read,
        postgres::resolve::PostgresContext,
        query::{Expression, ExpressionError, Literal},
        AsClient, InsertionError, LinkTypeStore, PostgresStore, QueryError, UpdateError,
    },
};

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

// TODO: Unify methods for Ontology types using `Expression`s
//   see https://app.asana.com/0/0/1202884883200959/f
#[async_trait]
impl<C: AsClient> Read<PersistedLinkType> for PostgresStore<C> {
    type Query<'q> = Expression;

    async fn read<'query>(
        &self,
        expression: &Self::Query<'query>,
    ) -> Result<Vec<PersistedLinkType>, QueryError> {
        self.read_all_link_types()
            .await?
            .try_filter_map(|link_type| async move {
                if let Literal::Bool(result) = expression
                    .evaluate(&link_type, self)
                    .await
                    .change_context(QueryError)?
                {
                    Ok(result.then(|| {
                        let uri = link_type.record.id();
                        let identifier =
                            PersistedOntologyIdentifier::new(uri.clone(), link_type.account_id);
                        PersistedLinkType {
                            inner: link_type.record,
                            identifier,
                        }
                    }))
                } else {
                    bail!(
                        Report::new(ExpressionError)
                            .attach_printable("does not result in a boolean value")
                            .change_context(QueryError)
                    );
                }
            })
            .try_collect()
            .await
    }
}
