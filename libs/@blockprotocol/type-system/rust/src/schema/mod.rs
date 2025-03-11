//! Definitions of the elements of the Type System.
//!
//! This module contains the definitions of [`DataType`]s, [`PropertyType`]s, [`EntityType`]s. The
//! structs are Rust representations of their meta-schemas defined within the Block Protocol
//! specification, and are used to validate instances of types using [`serde`]. To aid with the
//! de/serialization, intermediary structs and helpers are defined across various submodules.
//!
//! # Type System Architecture
//!
//! The Block Protocol Type System is organized hierarchically with three main components:
//!
//! ## Data Types
//!
//! [`DataType`]s are the foundation of the type system and represent primitive value types:
//!
//! - `Null` - Represents the absence of a value
//! - `Boolean` - True/false values
//! - `Number` - Numeric values with optional constraints like minimum/maximum
//! - `String` - Text values with optional constraints like patterns or formats
//! - `Array` - Ordered collections of items
//! - `Object` - Collections of key-value pairs
//! - `AnyOf` - Union types representing one of several possible types
//!
//! ## Property Types
//!
//! [`PropertyType`]s define reusable properties that can be attached to entities. A property type
//! contains a reference to either:
//!
//! - A [`DataType`] reference for simple properties
//! - An object structure with nested property definitions
//! - An array of property values
//!
//! Property types enable composition and reuse across different entity types.
//!
//! ## Entity Types
//!
//! [`EntityType`]s define the structure of entities with:
//!
//! - Properties specified by [`PropertyType`] references
//! - Links to other entity types
//! - Inheritance from other entity types via `all_of`
//!
//! Entity types form the highest level of abstraction in the type system and are used to validate
//! complete entity instances.
//!
//! # Validation Flow
//!
//! Each type level has its own validator:
//!
//! - [`DataTypeValidator`] validates values against data types
//! - [`PropertyTypeValidator`] validates property values against property types
//! - [`EntityTypeValidator`] validates entity instances against entity types
//!
//! The validation process typically follows this pattern:
//!
//! 1. Parse the type definition from JSON/YAML using `serde`
//! 2. Create a validator for the type
//! 3. Validate input data against the type
//! 4. Receive a [`Valid<T>`] wrapper for type-safe operations on validated data
//!
//! [`Valid<T>`]: crate::Valid
//!
//! # Resolution and Closure
//!
//! The type system supports references between types, requiring resolution:
//!
//! - [`ClosedDataType`] is a data type with all references resolved
//! - [`ClosedEntityType`] is an entity type with all references resolved
//! - [`OntologyTypeResolver`] handles the resolution of type references
//!
//! This closure process ensures all constraints from referenced types are properly applied
//! during validation.

mod closed_resolver;
mod data_type;
mod entity_type;
mod property_type;

mod array;
mod domain_validator;
mod object;
mod one_of;

mod identifier;

pub use self::{
    array::{
        ArraySchemaValidationError, ArraySchemaValidator, PropertyArraySchema, PropertyValueArray,
        ValueOrArray,
    },
    closed_resolver::{InheritanceDepth, OntologyTypeResolver},
    data_type::{
        AnyOfConstraints, ArrayConstraints, ArraySchema, ArrayTypeTag, ArrayValidationError,
        BooleanSchema, BooleanTypeTag, ClosedDataType, ConstraintError, ConstraintValidator,
        ConversionDefinition, ConversionExpression, ConversionValue, Conversions, DataType,
        DataTypeEdge, DataTypeMetadata, DataTypeReference, DataTypeResolveData, DataTypeValidator,
        DataTypeWithMetadata, JsonSchemaValueType, NullSchema, NullTypeTag, NumberConstraints,
        NumberSchema, NumberTypeTag, NumberValidationError, ObjectConstraints, ObjectSchema,
        ObjectTypeTag, ObjectValidationError, Operator, SingleValueConstraints, SingleValueSchema,
        StringConstraints, StringFormat, StringFormatError, StringSchema, StringTypeTag,
        StringValidationError, TupleConstraints, ValidateDataTypeError, ValueLabel,
        ValueSchemaMetadata, Variable,
    },
    domain_validator::{DomainValidationError, DomainValidator, ValidateOntologyType},
    entity_type::{
        ClosedEntityType, ClosedEntityTypeMetadata, ClosedMultiEntityType, EntityConstraints,
        EntityType, EntityTypeMetadata, EntityTypeReference, EntityTypeResolveData,
        EntityTypeSchemaMetadata, EntityTypeToEntityTypeEdge, EntityTypeToPropertyTypeEdge,
        EntityTypeValidationError, EntityTypeValidator, EntityTypeWithMetadata,
        InverseEntityTypeMetadata, PartialEntityType, ResolveClosedEntityTypeError,
    },
    identifier::{DataTypeUuid, EntityTypeUuid, OntologyTypeUuid, PropertyTypeUuid},
    object::{
        ObjectSchemaValidationError, ObjectSchemaValidator, PropertyObjectSchema,
        PropertyValueObject,
    },
    one_of::{OneOfSchema, OneOfSchemaValidationError, OneOfSchemaValidator},
    property_type::{
        PropertyType, PropertyTypeMetadata, PropertyTypeReference, PropertyTypeValidationError,
        PropertyTypeValidator, PropertyTypeWithMetadata, PropertyValueSchema, PropertyValueType,
        PropertyValues,
    },
};
