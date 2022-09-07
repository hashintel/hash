mod resolve;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;
use type_system::PropertyType;

use crate::{
    ontology::{AccountId, PersistedOntologyIdentifier},
    store::{AsClient, InsertionError, PostgresStore, PropertyTypeStore, UpdateError},
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

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_property_type_references` taking `&property_type`
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

        // This clone is currently necessary because we extract the references as we insert them.
        // We can only insert them after the type has been created, and so we currently extract them
        // after as well. See `insert_property_type_references` taking `&property_type`
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
