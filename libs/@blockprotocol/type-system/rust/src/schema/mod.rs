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

pub use self::{
    array::{PropertyArraySchema, PropertyValueArray, ValueOrArray},
    data_type::{
        AnyOfConstraints, ArrayConstraints, ArraySchema, ArrayTypeTag, ArrayValidationError,
        BooleanTypeTag, ClosedDataType, ConstraintError, ConversionDefinition,
        ConversionExpression, ConversionValue, Conversions, DataType, DataTypeId,
        DataTypeInheritanceData, DataTypeReference, DataTypeValidator, InheritanceDepth,
        JsonSchemaValueType, NullTypeTag, NumberConstraints, NumberSchema, NumberTypeTag,
        NumberValidationError, ObjectTypeTag, OntologyTypeResolver, Operator,
        SingleValueConstraints, SingleValueSchema, StringConstraints, StringFormat,
        StringFormatError, StringSchema, StringTypeTag, StringValidationError, TupleConstraints,
        ValidateDataTypeError, ValueLabel, Variable,
    },
    entity_type::{
        ClosedEntityType, ClosedEntityTypeSchemaData, EntityType, EntityTypeReference,
        EntityTypeValidationError, EntityTypeValidator,
    },
    object::{
        ObjectSchemaValidationError, ObjectSchemaValidator, PropertyObjectSchema,
        PropertyValueObject,
    },
    one_of::{OneOfSchema, OneOfSchemaValidationError, OneOfSchemaValidator},
    property_type::{
        PropertyType, PropertyTypeReference, PropertyTypeValidationError, PropertyTypeValidator,
        PropertyValueSchema, PropertyValues,
    },
};
