mod read;

use async_trait::async_trait;
use error_stack::{bail, IntoReport, Report, Result, ResultExt};
use futures::TryStreamExt;
use tokio_postgres::GenericClient;
use type_system::EntityType;

use crate::{
    ontology::{AccountId, PersistedEntityType, PersistedOntologyIdentifier},
    store::{
        crud::Read,
        postgres::resolve::PostgresContext,
        query::{Expression, ExpressionError, Literal},
        AsClient, EntityTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
};

#[async_trait]
impl<C: AsClient> EntityTypeStore for PostgresStore<C> {
    async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
        created_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_entity_type_references` taking `&entity_type`
        let (version_id, identifier) = transaction.create(entity_type.clone(), created_by).await?;

        transaction
            .insert_entity_type_references(&entity_type, version_id)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not insert references for entity type")
            .attach_lazy(|| entity_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(identifier)
    }

    async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_entity_type_references` taking `&entity_type`
        let (version_id, identifier) = transaction.update(entity_type.clone(), updated_by).await?;

        transaction
            .insert_entity_type_references(&entity_type, version_id)
            .await
            .change_context(UpdateError)
            .attach_printable("Could not insert references for entity type")
            .attach_lazy(|| entity_type.clone())?;

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
impl<C: AsClient> Read<PersistedEntityType> for PostgresStore<C> {
    type Query<'q> = Expression;

    async fn read<'query>(
        &self,
        expression: &Self::Query<'query>,
    ) -> Result<Vec<PersistedEntityType>, QueryError> {
        self.read_all_entity_types()
            .await?
            .try_filter_map(|entity_type| async move {
                if let Literal::Bool(result) = expression
                    .evaluate(&entity_type, self)
                    .await
                    .change_context(QueryError)?
                {
                    Ok(result.then(|| {
                        let uri = entity_type.record.id();
                        let identifier =
                            PersistedOntologyIdentifier::new(uri.clone(), entity_type.account_id);
                        PersistedEntityType {
                            inner: entity_type.record,
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
