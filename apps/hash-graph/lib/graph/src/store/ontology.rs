use std::{borrow::Borrow, iter};

use async_trait::async_trait;
use error_stack::Result;
use type_system::{DataType, EntityType, PropertyType};

use crate::{
    ontology::{
        DataTypeWithMetadata, EntityTypeWithMetadata, OntologyElementMetadata,
        PropertyTypeWithMetadata,
    },
    provenance::UpdatedById,
    store::{crud, InsertionError, QueryError, UpdateError},
    subgraph::{query::StructuralQuery, Subgraph},
};

/// Describes the API of a store implementation for [`DataType`]s.
#[async_trait]
pub trait DataTypeStore: crud::Read<DataTypeWithMetadata> {
    /// Creates a new [`DataType`].
    ///
    /// # Errors:
    ///
    /// - if any account referred to by `metadata` does not exist.
    /// - if the [`BaseUrl`] of the `data_type` already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    async fn create_data_type(
        &mut self,
        schema: DataType,
        metadata: &OntologyElementMetadata,
    ) -> Result<(), InsertionError> {
        self.create_data_types(iter::once((schema, metadata))).await
    }

    /// Creates the provided [`DataType`]s.
    ///
    /// # Errors:
    ///
    /// - if any account referred to by the metadata does not exist.
    /// - if any [`BaseUrl`] of the data type already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    async fn create_data_types(
        &mut self,
        data_types: impl IntoIterator<
            Item = (DataType, impl Borrow<OntologyElementMetadata> + Send + Sync),
            IntoIter: Send,
        > + Send,
    ) -> Result<(), InsertionError>;

    /// Get the [`Subgraph`] specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`DataType`] doesn't exist.
    async fn get_data_type(
        &self,
        query: &StructuralQuery<DataTypeWithMetadata>,
    ) -> Result<Subgraph, QueryError>;

    /// Update the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    async fn update_data_type(
        &mut self,
        data_type: DataType,
        actor_id: UpdatedById,
    ) -> Result<OntologyElementMetadata, UpdateError>;
}

/// Describes the API of a store implementation for [`PropertyType`]s.
#[async_trait]
pub trait PropertyTypeStore: crud::Read<PropertyTypeWithMetadata> {
    /// Creates a new [`PropertyType`].
    ///
    /// # Errors:
    ///
    /// - if any account referred to by `metadata` does not exist.
    /// - if the [`BaseUrl`] of the `property_type` already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    async fn create_property_type(
        &mut self,
        schema: PropertyType,
        metadata: &OntologyElementMetadata,
    ) -> Result<(), InsertionError> {
        self.create_property_types(iter::once((schema, metadata)))
            .await
    }

    /// Creates the provided [`PropertyType`]s.
    ///
    /// # Errors:
    ///
    /// - if any account referred to by the metadata does not exist.
    /// - if any [`BaseUrl`] of the property type already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    async fn create_property_types(
        &mut self,
        property_types: impl IntoIterator<
            Item = (
                PropertyType,
                impl Borrow<OntologyElementMetadata> + Send + Sync,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<(), InsertionError>;

    /// Get the [`Subgraph`] specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    async fn get_property_type(
        &self,
        query: &StructuralQuery<PropertyTypeWithMetadata>,
    ) -> Result<Subgraph, QueryError>;

    /// Update the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
        actor_id: UpdatedById,
    ) -> Result<OntologyElementMetadata, UpdateError>;
}

/// Describes the API of a store implementation for [`EntityType`]s.
#[async_trait]
pub trait EntityTypeStore: crud::Read<EntityTypeWithMetadata> {
    /// Creates a new [`EntityType`].
    ///
    /// # Errors:
    ///
    /// - if any account referred to by `metadata` does not exist.
    /// - if the [`BaseUrl`] of the `entity_type` already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    async fn create_entity_type(
        &mut self,
        schema: EntityType,
        metadata: &OntologyElementMetadata,
    ) -> Result<(), InsertionError> {
        self.create_entity_types(iter::once((schema, metadata)))
            .await
    }

    /// Creates the provided [`EntityType`]s.
    ///
    /// # Errors:
    ///
    /// - if any account referred to by the metadata does not exist.
    /// - if any [`BaseUrl`] of the entity type already exists.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    async fn create_entity_types(
        &mut self,
        entity_types: impl IntoIterator<
            Item = (
                EntityType,
                impl Borrow<OntologyElementMetadata> + Send + Sync,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<(), InsertionError>;

    /// Get the [`Subgraph`]s specified by the [`StructuralQuery`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    async fn get_entity_type(
        &self,
        query: &StructuralQuery<EntityTypeWithMetadata>,
    ) -> Result<Subgraph, QueryError>;

    /// Update the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
        actor_id: UpdatedById,
    ) -> Result<OntologyElementMetadata, UpdateError>;
}
