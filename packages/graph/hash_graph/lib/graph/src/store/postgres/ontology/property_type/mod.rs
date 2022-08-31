mod read;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::PropertyType;

use crate::{
    ontology::{AccountId, PersistedOntologyIdentifier, PersistedPropertyType},
    store::{
        crud::Read,
        postgres::resolve::{PostgresContext, Record},
        query::{Expression, Literal},
        AsClient, InsertionError, PostgresStore, PropertyTypeStore, QueryError, UpdateError,
    },
};

#[async_trait]
impl<C: AsClient> PropertyTypeStore for PostgresStore<C> {
    async fn create_property_type(
        &mut self,
        property_type: PropertyType,
        created_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        // TODO - get rid of the clone on property_type
        let (version_id, identifier) = transaction
            .create(property_type.clone(), created_by)
            .await?;

        transaction
            .insert_property_type_references(&property_type, version_id)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not insert references for property type")
            .attach_lazy(|| property_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(identifier)
    }

    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        // TODO - get rid of the clone on property_type
        let (version_id, identifier) = transaction
            .update(property_type.clone(), updated_by)
            .await?;

        transaction
            .insert_property_type_references(&property_type, version_id)
            .await
            .change_context(UpdateError)
            .attach_printable("Could not insert references for property type")
            .attach_lazy(|| property_type.clone())?;

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
impl<C: AsClient> Read<PersistedPropertyType> for PostgresStore<C> {
    type Query<'q> = Expression;

    async fn read<'query>(
        &self,
        expression: &Self::Query<'query>,
    ) -> Result<Vec<PersistedPropertyType>, QueryError> {
        self.read_all_property_types()
            .await?
            .map(|row_result| row_result.into_report().change_context(QueryError))
            .try_filter_map(|row| async move {
                let property_type: PropertyType = serde_json::Value::try_into(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;

                let versioned_property_type = Record {
                    record: property_type,
                    is_latest: row.get(2),
                };

                if let Literal::Bool(result) =
                    expression.evaluate(&versioned_property_type, self).await
                {
                    Ok(result.then(|| {
                        let uri = versioned_property_type.record.id();
                        let account_id: AccountId = row.get(1);
                        let identifier = PersistedOntologyIdentifier::new(uri.clone(), account_id);
                        PersistedPropertyType {
                            inner: versioned_property_type.record,
                            identifier,
                        }
                    }))
                } else {
                    // TODO: Implement error handling
                    //   see https://app.asana.com/0/0/1202884883200968/f
                    panic!("Expression does not result in a boolean value")
                }
            })
            .try_collect()
            .await
    }
}
