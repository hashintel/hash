#![feature(extend_one)]
#![expect(unsafe_code)]
#![cfg_attr(
    target_arch = "wasm32",
    expect(unreachable_pub, reason = "Used in the generated TypeScript types")
)]

//! # Block Protocol Type System
//!
//! This crate implements the [Block Protocol](https://blockprotocol.org) type system in Rust.
//! It provides a comprehensive foundation for defining, validating, and working with typed data
//! within the HASH ecosystem.
//!
//! ## Architecture Overview
//!
//! The type system is built around three core type abstractions, which form a hierarchical
//! relationship:
//!
//! 1. **Data Types** - Define the structure and constraints for primitive values like strings,
//!    numbers, booleans, as well as complex types like arrays and objects.
//!
//! 2. **Property Types** - Define reusable properties with their own validation schema. Property
//!    types can reference data types or compose other property types.
//!
//! 3. **Entity Types** - Define complete entity structures with property and relationship
//!    requirements. Entity types can inherit from other entity types and define links to other
//!    entities.
//!
//! ## Core Components
//!
//! - [`Value`] - A JSON-compatible value representation used throughout the system
//! - [`Validator`] - A trait for implementing validation logic
//! - [`Valid<T>`] - A wrapper that guarantees a value has been validated
//! - [`schema`] module - Contains the definitions for data, property, and entity types
//!
//! ## Comprehensive Guide: Working with Types
//!
//! ### Creating and Validating Types
//!
//! The typical workflow for working with the type system follows these steps:
//!
//! ```
//! use serde_json::json;
//! use type_system::{
//!     schema::{DataType, DataTypeValidator},
//!     Valid, Validator, Value
//! };
//!
//! // 1. Define a Type
//! let number_type_json = json!({
//!     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
//!     "kind": "dataType",
//!     "$id": "https://example.com/types/data-type/positive-number/v/1",
//!     "title": "Positive Number",
//!     "description": "A number greater than zero",
//!     "type": "number",
//!     "exclusiveMinimum": 0,
//!     "allOf": [
//!        { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1" }
//!     ]
//! });
//!
//! // 2. Parse and create the type
//! let number_type = serde_json::from_value::<DataType>(number_type_json)
//!     .expect("Failed to parse data type");
//!
//! // 3. Create a validator
//! let validator = DataTypeValidator;
//!
//! // 4. Validate the type definition itself
//! let valid_number_type = validator.validate(number_type)
//!     .expect("Type definition should be valid");
//!
//! // 5. Later, validate values against this type
//! // (This would typically be done using a ClosedDataType - see below)
//! ```
//!
//! ### Type Resolution
//!
//! Most non-trivial types reference other types. These references need to be resolved
//! before validation:
//!
//! ```
//! # use std::{
//! #     collections::{BTreeSet, HashMap},
//! #     sync::Arc,
//! # };
//! #
//! # use serde_json::json;
//! # use type_system::{
//! #     Value,
//! #     schema::{
//! #         ClosedDataType, DataType, DataTypeReference, DataTypeUuid, InheritanceDepth,
//! #         OntologyTypeResolver,
//! #     },
//! # };
//! #
//! # use crate::type_system::schema::ConstraintValidator;
//! #
//! # let number_type: DataType = serde_json::from_value(json!({
//! #     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
//! #     "kind": "dataType",
//! #     "type": "number",
//! #     "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
//! #     "title": "Number",
//! #     "description": "A numerical value",
//! # }))?;
//! let data_type_uuid = DataTypeUuid::from_url(&number_type.id);
//!
//! // Create a resolver with access to all available types
//! let mut resolver = OntologyTypeResolver::default();
//! resolver.add_unresolved_data_type(data_type_uuid, Arc::new(number_type.clone()));
//!
//! // Resolve references to create a closed (fully resolved) type
//! let data_type_metadata = resolver.resolve_data_type_metadata(data_type_uuid)?;
//! let closed_data_type = ClosedDataType::from_resolve_data(number_type, &data_type_metadata)?;
//!
//! // Now you can validate values against the closed type
//! for constraint in closed_data_type.all_of {
//!     assert!(constraint.is_valid(&Value::Number(42_i32.into())));
//! }
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```
//!
//! ### Type Validation Best Practices
//!
//! 1. **Separate Type Definition from Value Validation**
//!    - First validate your type definitions
//!    - Then use those validated types to validate values
//!
//! 2. **Handle Type Resolution Carefully**
//!    - The type system supports recursive references
//!    - Use [`schema::OntologyTypeResolver`] to handle reference resolution
//!    - Cache resolved types when validating multiple values
//!
//! 3. **Use the Type Safety Guarantees**
//!    - The [`Valid<T>`] wrapper ensures values have been validated
//!    - Use pattern matching or deref to access the inner value
//!    - Return [`Valid<T>`] from functions to propagate type safety
//!
//! ### Testing Types
//!
//! The crate provides special utilities for testing type definitions:
//!
//! ```
//! use serde_json::json;
//! use type_system::{
//!     Value, Valid, Validator,
//!     schema::{DataType, DataTypeValidator, ClosedDataType}
//! };
//!
//! # // This shows how you might write tests for type validation
//! # fn test_example() {
//! // Define a simple data type for testing
//! let data_type_json = json!({
//!     "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
//!     "kind": "dataType",
//!     "type": "number",
//!     "$id": "https://example.com/types/data-type/positive-number/v/1",
//!     "title": "Positive Number",
//!     "description": "A number greater than zero",
//!     "exclusiveMinimum": 0,
//!     "allOf": [
//!         { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1" }
//!     ]
//! });
//!
//! // Test the type definition itself
//! let data_type: DataType = serde_json::from_value(data_type_json)
//!     .expect("Should parse data type definition");
//!
//! let validator = DataTypeValidator;
//! let valid_type = validator.validate(data_type)
//!     .expect("Type definition should be valid");
//!
//! // For testing value validation, you would normally use a ClosedDataType
//! // Here's a simple example of how value validation might be tested:
//! #
//! # // In a real test, you would use a properly resolved ClosedDataType
//! # // This is just for illustrative purposes
//! # let constraint_validator = {
//! #     struct NumberValidator;
//! #     impl Validator<Value> for NumberValidator {
//! #         type Error = &'static str;
//! #         fn validate_ref<'v>(&self, value: &'v Value) -> Result<&'v Valid<Value>, Self::Error> {
//! #             match value {
//! #                 Value::Number(n) => {
//! #                     if let Some(i) = n.to_i32() {
//! #                         if i > 0 {
//! #                             return Ok(Valid::new_ref_unchecked(value));
//! #                         }
//! #                     }
//! #                     Err("Value must be a positive number")
//! #                 },
//! #                 _ => Err("Value must be a number")
//! #             }
//! #         }
//! #     }
//! #     NumberValidator
//! # };
//! #
//! let valid_value = Value::Number(5_i32.into());
//! let invalid_value = Value::Number((-1_i32).into());
//!
//! // Test validation
//! let validated = constraint_validator.validate_ref(&valid_value)
//!     .expect("Positive number should validate");
//! assert!(constraint_validator.validate_ref(&invalid_value).is_err(),
//!     "Negative number should fail validation");
//! # }
//! ```
//!
//! ## Validation Flow
//!
//! The validation process typically follows this pattern:
//!
//! 1. Define types (data types, property types, entity types)
//! 2. Create validators for those types
//! 3. Validate input data against those types
//! 4. Use the resulting [`Valid<T>`] wrapper to ensure type safety
//!
//! ## Features
//!
//! - `postgres` - Enables PostgreSQL integration
//! - `utoipa` - Enables OpenAPI schema generation

extern crate alloc;

pub mod url;

pub mod schema;
mod utils;

use alloc::sync::Arc;
#[cfg(feature = "postgres")]
use core::error::Error;
use core::{
    borrow::Borrow,
    fmt::{self, Debug},
    ops::Deref,
    ptr,
};
use std::collections::HashMap;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use hash_codec::numeric::Real;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};
use serde::Serialize as _;

/// A JSON-compatible value type that can represent any valid JSON structure.
///
/// This enum is the fundamental data unit in the type system and is used throughout
/// the validation process. It's designed to work well with serde for serialization/deserialization
/// and can be used in both Rust and WebAssembly contexts.
///
/// # Examples
///
/// ```
/// use std::collections::HashMap;
///
/// use type_system::Value;
///
/// // Create a simple string value
/// let string_value = Value::String("Hello, world!".to_string());
///
/// // Create a more complex object value
/// let mut obj = HashMap::new();
/// obj.insert("greeting".to_string(), Value::String("Hello".to_string()));
/// obj.insert("count".to_string(), Value::Number(42_i32.into()));
/// let object_value = Value::Object(obj);
/// ```
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged, rename = "JsonValue")]
pub enum Value {
    Null,
    Bool(bool),
    String(String),
    Number(#[cfg_attr(target_arch = "wasm32", tsify(type = "number"))] Real),
    Array(#[cfg_attr(target_arch = "wasm32", tsify(type = "JsonValue[]"))] Vec<Self>),
    Object(
        #[cfg_attr(target_arch = "wasm32", tsify(type = "{ [key: string]: JsonValue }"))]
        HashMap<String, Self>,
    ),
}

impl fmt::Display for Value {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for Value {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::<Self>::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for Value {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        Json(self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as ToSql>::accepts(ty)
    }
}

/// A trait for validating values against a schema or constraint.
///
/// The `Validator` trait is a core abstraction in the type system that enables validation
/// of values against their respective schemas. Implementations of this trait handle the
/// specific validation logic for different types (data types, property types, entity types).
///
/// The trait uses the `Valid<V>` wrapper to guarantee that values passing validation
/// satisfy all constraints defined by the validator.
///
/// # Examples
///
/// ```
/// use type_system::{Valid, Validator, Value};
///
/// // A simple validator that ensures a string value has a certain prefix
/// struct PrefixValidator {
///     prefix: String,
/// }
///
/// impl Validator<Value> for PrefixValidator {
///     type Error = &'static str;
///
///     fn validate_ref<'v>(&self, value: &'v Value) -> Result<&'v Valid<Value>, Self::Error> {
///         if let Value::String(s) = value {
///             if s.starts_with(&self.prefix) {
///                 return Ok(Valid::new_ref_unchecked(value));
///             }
///         }
///         Err("Value must be a string with the correct prefix")
///     }
/// }
/// ```
pub trait Validator<V>: Sync {
    /// The error type returned when validation fails
    type Error;

    /// Validates a reference and return [`&Valid<V>`] if it is valid.
    ///
    /// [`&Valid<V>`]: Valid
    ///
    /// # Errors
    ///
    /// Returns an error if the value is invalid.
    fn validate_ref<'v>(&self, value: &'v V) -> Result<&'v Valid<V>, Self::Error>;

    /// Validates a value and return [`Valid<V>`] if it is valid.
    ///
    /// [`Valid<V>`]: Valid
    ///
    /// # Errors
    ///
    /// Returns an error if the value is invalid.
    fn validate(&self, value: V) -> Result<Valid<V>, Self::Error> {
        self.validate_ref(&value)?;
        Ok(Valid { value })
    }
}

impl<V, T> Validator<Arc<V>> for T
where
    V: Send + Sync,
    T: Validator<V> + Sync,
{
    type Error = T::Error;

    fn validate_ref<'v>(&self, value: &'v Arc<V>) -> Result<&'v Valid<Arc<V>>, Self::Error>
    where
        V: Sync,
    {
        self.validate_ref(value.as_ref())?;
        Ok(Valid::new_ref_unchecked(value))
    }
}

/// A wrapper type that guarantees a value has been validated against a validator.
///
/// The `Valid<T>` type is a zero-cost abstraction that provides static guarantees
/// that a value has passed validation. This is used throughout the type system to
/// ensure type safety when working with validated data.
///
/// # Examples
///
/// ```
/// use type_system::{Valid, Validator, Value};
///
/// // Example implementation of a simple validator
/// struct AlwaysValidValidator;
///
/// impl Validator<Value> for AlwaysValidValidator {
///     type Error = &'static str;
///
///     fn validate_ref<'v>(&self, value: &'v Value) -> Result<&'v Valid<Value>, Self::Error> {
///         // This validator considers all values valid
///         Ok(Valid::new_ref_unchecked(value))
///     }
/// }
///
/// // Using the validator to produce a Valid<Value>
/// let validator = AlwaysValidValidator;
/// let value = Value::String("example".to_string());
///
/// let valid_value = validator.validate(value).unwrap();
///
/// // Once validated, you can access the inner value with deref operators
/// if let Value::String(s) = &*valid_value {
///     assert_eq!(s, "example");
/// }
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
#[repr(transparent)]
pub struct Valid<T> {
    value: T,
}

impl<T> Valid<T> {
    pub const fn new_unchecked(value: T) -> Self {
        Self { value }
    }

    pub const fn new_ref_unchecked(value: &T) -> &Self {
        // SAFETY: Self is `repr(transparent)`
        unsafe { &*ptr::from_ref(value).cast::<Self>() }
    }

    pub fn into_inner(self) -> T {
        self.value
    }
}

impl<T> Deref for Valid<T> {
    type Target = T;

    fn deref(&self) -> &T {
        &self.value
    }
}

impl<T> Borrow<T> for Valid<T> {
    fn borrow(&self) -> &T {
        &self.value
    }
}

impl<T> AsRef<T> for Valid<T> {
    fn as_ref(&self) -> &T {
        self.borrow()
    }
}

#[cfg(feature = "postgres")]
impl<'de, 'a: 'de, T> FromSql<'a> for Valid<T>
where
    T: serde::Deserialize<'de>,
{
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self {
            value: Json::from_sql(ty, raw)?.0,
        })
    }

    fn accepts(ty: &Type) -> bool {
        <Json<T> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl<T> ToSql for Valid<T>
where
    T: serde::Serialize + Debug,
{
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        Json(&**self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<T> as ToSql>::accepts(ty)
    }
}
