//! Definitions of the elements of the Type System.
//!
//! This module contains the definitions of [`DataType`]s, [`PropertyType`]s, [`EntityType`]s. The
//! structs are Rust representations of their meta-schemas defined within the Block Protocol
//! specification, and are used to validate instances of types using [`serde`]. To aid with the
//! de/serialization, intermediary structs and helpers are defined across various submodules.

mod data_type;
mod entity_type;
mod property_type;

mod array;
mod object;
mod one_of;

use core::borrow::Borrow;

use error_stack::{Context, Report};
use futures::{stream, StreamExt, TryStreamExt};

pub use self::{
    array::{ArraySchema, PropertyArraySchema, ValueOrArray},
    data_type::{
        ClosedDataType, ClosedDataTypeMetadata, ConversionDefinition, ConversionExpression,
        ConversionValue, Conversions, DataType, DataTypeLabel, DataTypeReference,
        DataTypeValidator, JsonSchemaValueType, OntologyTypeResolver, Operator,
        ValidateDataTypeError, Variable,
    },
    entity_type::{
        ClosedEntityType, ClosedEntityTypeSchemaData, EntityType, EntityTypeReference,
        EntityTypeValidationError, EntityTypeValidator,
    },
    object::{
        ObjectSchema, ObjectSchemaValidationError, ObjectSchemaValidator, PropertyObjectSchema,
    },
    one_of::{OneOfSchema, OneOfSchemaValidationError, OneOfSchemaValidator},
    property_type::{
        PropertyType, PropertyTypeReference, PropertyTypeValidationError, PropertyTypeValidator,
        PropertyValueSchema, PropertyValues,
    },
};
use crate::url::{BaseUrl, VersionedUrl};

pub trait OntologyTypeProvider<O> {
    fn provide_type(
        &self,
        type_id: &VersionedUrl,
    ) -> impl Future<Output = Result<impl Borrow<O> + Send, Report<impl Context>>> + Send;
}

pub trait DataTypeProvider: OntologyTypeProvider<DataType> {
    fn is_parent_of(
        &self,
        child: &VersionedUrl,
        parent: &BaseUrl,
    ) -> impl Future<Output = Result<bool, Report<impl Context>>> + Send;
    fn has_children(
        &self,
        data_type: &VersionedUrl,
    ) -> impl Future<Output = Result<bool, Report<impl Context>>> + Send;
}

pub trait PropertyTypeProvider: OntologyTypeProvider<PropertyType> {}

pub trait EntityTypeProvider: OntologyTypeProvider<ClosedEntityType> {
    fn is_parent_of(
        &self,
        child: &VersionedUrl,
        parent: &BaseUrl,
    ) -> impl Future<Output = Result<bool, Report<impl Context>>> + Send;

    fn provide_closed_type<'a, I>(
        &self,
        type_ids: I,
    ) -> impl Future<Output = Result<ClosedEntityType, Report<impl Context>>> + Send
    where
        Self: Sync,
        I: IntoIterator<Item = &'a VersionedUrl, IntoIter: Send> + Send,
    {
        stream::iter(type_ids)
            .then(|entity_type_url| async {
                Ok(self.provide_type(entity_type_url).await?.borrow().clone())
            })
            .try_collect::<ClosedEntityType>()
    }
}
