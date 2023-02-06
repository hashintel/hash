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
    /// - if the account referred to by `owned_by_id` does not exist.
    /// - if the [`BaseUri`] of the `data_type` already exist.
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn create_data_type(
        &mut self,
        schema: DataType,
        metadata: &OntologyElementMetadata,
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
    /// - if the account referred to by `owned_by_id` does not exist.
    /// - if the [`BaseUri`] of the `property_type` already exists.
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn create_property_type(
        &mut self,
        schema: PropertyType,
        metadata: &OntologyElementMetadata,
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
    /// - if the account referred to by `owned_by_id` does not exist.
    /// - if the [`BaseUri`] of the `entity_type` already exist.
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn create_entity_type(
        &mut self,
        schema: EntityType,
        metadata: &OntologyElementMetadata,
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
