#![feature(
    // Language Features
    impl_trait_in_assoc_type,

    // Library Features
    extend_one,
)]
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
//! In addition to these core types, the system includes:
//!
//! 4. **Ontology Metadata** - Contains information about type records, including:
//!    - Record identifiers that uniquely reference each type
//!    - Temporal versioning data for tracking changes over time
//!    - Ownership information that determines if a type is local or remote
//!
//! 5. **Provenance** - Tracks the origin and history of types through:
//!    - Actor information (who created or archived a type)
//!    - Source details (where a type originated from)
//!    - Origin data (how the type came into existence)
//!
//! ## Core Components
//!
//! The type system consists of three main parts: the ontology (type definitions), knowledge (data
//! instances), and principals (identity and access):
//!
//! - [`ontology`] module - Contains the schema definitions for data, property, and entity types:
//!   - [`ontology::data_type`] - Defines validation rules for primitive values
//!   - [`ontology::property_type`] - Defines reusable property schemas
//!   - [`ontology::entity_type`] - Defines complete entity structures and relationships
//!
//! - [`knowledge`] module - Contains data instances that conform to ontology types:
//!   - [`knowledge::PropertyValue`] - Primitive values conforming to data types
//!   - [`knowledge::Property`] - Structured data conforming to property types
//!   - [`knowledge::Entity`] - Complete entities conforming to entity types
//!
//! - [`principal`] module - Defines identity and access management constructs:
//!   - [`principal::Actor`] - Individual entities that can perform actions
//!   - [`principal::ActorGroup`] - Collections of actors sharing common characteristics
//!   - [`principal::Role`] - Access control designations for principals
//!
//! The relationship between ontology and knowledge is similar to schemas and records in databases:
//! ontology types define the structure and rules, while knowledge components contain the actual
//! data conforming to those rules. Principals provide identity context for operations performed
//! on ontology and knowledge.
//!
//! Additional components:
//!
//! - [`provenance`] module - Contains types for tracking origin and history of ontology types
//! - [`Validator`] - A trait for implementing validation logic
//! - [`Valid<T>`] - A wrapper that guarantees a value has been validated
//!
//! ## Comprehensive Guide: Working with Types
//!
//! ### Working with Ontology Metadata and Provenance
//!
//! The type system provides comprehensive support for tracking metadata and provenance:
//!
//! ```
//! use std::str::FromStr;
//!
//! use time::OffsetDateTime;
//! use type_system::{
//!     knowledge::entity::id::EntityUuid,
//!     ontology::provenance::{
//!         OntologyEditionProvenance, OntologyOwnership, OntologyProvenance,
//!         ProvidedOntologyEditionProvenance,
//!     },
//!     principal::{
//!         actor::{ActorEntityUuid, ActorType},
//!         actor_group::WebId,
//!     },
//!     provenance::{OriginProvenance, OriginType},
//! };
//! use uuid::Uuid;
//!
//! // Create ownership information for a locally owned type
//! let web_id = Uuid::from_str("01234567-89ab-cdef-0123-456789abcdef").unwrap();
//! let web_id = WebId::new(web_id);
//! let ownership = OntologyOwnership::Local { web_id };
//!
//! // Alternative: For a type fetched from elsewhere
//! let remote_ownership = OntologyOwnership::Remote {
//!     fetched_at: OffsetDateTime::now_utc(),
//! };
//!
//! // Create provenance information
//! let actor_id = ActorEntityUuid::new(Uuid::from_u128(0x12345678_90AB_CDEF_1234_567890ABCDEF));
//! let edition_provenance = OntologyEditionProvenance {
//!     created_by_id: actor_id,
//!     archived_by_id: None,
//!     user_defined: {
//!         // User-defined provenance information
//!         let actor_type = ActorType::User;
//!         let origin = OriginProvenance {
//!             ty: OriginType::WebApp,
//!             id: None,
//!             version: None,
//!             semantic_version: None,
//!             environment: None,
//!             device_id: None,
//!             session_id: None,
//!             api_key_public_id: None,
//!             user_agent: None,
//!         };
//!         // Create the user-defined provenance
//!         ProvidedOntologyEditionProvenance {
//!             sources: vec![],
//!             actor_type,
//!             origin,
//!         }
//!     },
//! };
//!
//! // Create the complete provenance
//! let provenance = OntologyProvenance {
//!     edition: edition_provenance,
//! };
//!
//! // This metadata can then be attached to data type, property type, or entity type definitions
//! ```
//!
//! ### Creating and Validating Types
//!
//! The typical workflow for working with the type system follows these steps:
//!
//! ```
//! use serde_json::json;
//! use type_system::{
//!     knowledge::PropertyValue,
//!     ontology::data_type::schema::{DataType, DataTypeValidator},
//!     Valid, Validator
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
//! #     knowledge::PropertyValue,
//! #     ontology::{
//! #         data_type::{schema::{ClosedDataType, DataType, DataTypeReference}, DataTypeUuid},
//! #         InheritanceDepth,
//! #         json_schema::OntologyTypeResolver,
//! #     },
//! # };
//! #
//! # use type_system::ontology::json_schema::ConstraintValidator;
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
//!     assert!(constraint.is_valid(&PropertyValue::Number(42_i32.into())));
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
//!    - Use [`OntologyTypeResolver`] to handle reference resolution
//!    - Cache resolved types when validating multiple values
//!
//!    [`OntologyTypeResolver`]: crate::ontology::json_schema::OntologyTypeResolver
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
//!     knowledge::PropertyValue, Valid, Validator,
//!     ontology::data_type::schema::{DataType, DataTypeValidator, ClosedDataType}
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
//! #     impl Validator<PropertyValue> for NumberValidator {
//! #         type Error = &'static str;
//! #         fn validate_ref<'v>(&self, value: &'v PropertyValue) -> Result<&'v Valid<PropertyValue>, Self::Error> {
//! #             match value {
//! #                 PropertyValue::Number(n) => {
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
//! let valid_value = PropertyValue::Number(5_i32.into());
//! let invalid_value = PropertyValue::Number((-1_i32).into());
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
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]

extern crate alloc;

pub mod knowledge;
pub mod ontology;
pub mod principal;
pub mod provenance;
mod utils;

use alloc::sync::Arc;
#[cfg(feature = "postgres")]
use core::error::Error;
use core::{borrow::Borrow, fmt::Debug, ops::Deref, ptr};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, Json, ToSql, Type};

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
/// use type_system::{Valid, Validator, knowledge::PropertyValue};
///
/// // A simple validator that ensures a string value has a certain prefix
/// struct PrefixValidator {
///     prefix: String,
/// }
///
/// impl Validator<PropertyValue> for PrefixValidator {
///     type Error = &'static str;
///
///     fn validate_ref<'v>(
///         &self,
///         value: &'v PropertyValue,
///     ) -> Result<&'v Valid<PropertyValue>, Self::Error> {
///         if let PropertyValue::String(s) = value {
///             if s.starts_with(&self.prefix) {
///                 return Ok(Valid::new_ref_unchecked(value));
///             }
///         }
///         Err("Value must be a string with the correct prefix")
///     }
/// }
/// ```
pub trait Validator<V>: Sync {
    /// The error type returned when validation fails.
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
/// use type_system::{Valid, Validator, knowledge::PropertyValue};
///
/// // Example implementation of a simple validator
/// struct AlwaysValidValidator;
///
/// impl Validator<PropertyValue> for AlwaysValidValidator {
///     type Error = &'static str;
///
///     fn validate_ref<'v>(
///         &self,
///         value: &'v PropertyValue,
///     ) -> Result<&'v Valid<PropertyValue>, Self::Error> {
///         // This validator considers all values valid
///         Ok(Valid::new_ref_unchecked(value))
///     }
/// }
///
/// // Using the validator to produce a Valid<Value>
/// let validator = AlwaysValidValidator;
/// let value = PropertyValue::String("example".to_string());
///
/// let valid_value = validator.validate(value).unwrap();
///
/// // Once validated, you can access the inner value with deref operators
/// if let PropertyValue::String(s) = &*valid_value {
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
