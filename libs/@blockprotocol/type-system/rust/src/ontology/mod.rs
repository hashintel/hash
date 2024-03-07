//! Definitions of the elements of the Type System.
//!
//! This module contains the definitions of [`DataType`]s, [`PropertyType`]s, [`EntityType`]s. The
//! structs are Rust representations of their meta-schemas defined within the Block Protocol
//! specification, and are used to validate instances of types using [`serde`]. To aid with the
//! de/serialization, intermediary structs and helpers are defined across various submodules.

mod data_type;
mod entity_type;
mod property_type;
pub mod url;

mod shared;

pub use data_type::{DataType, DataTypeReference, ParseDataTypeError};
pub use entity_type::{
    links::{Links, MaybeOrderedArray, ParseLinksError},
    ClosedEntityType, ClosedEntityTypeSchemaData, EntityType, EntityTypeReference,
    MergeEntityTypeError, ParseEntityTypeError,
};
pub use property_type::{
    ParsePropertyTypeError, PropertyType, PropertyTypeReference, PropertyValues,
};
pub use shared::{
    all_of::{error::ParseAllOfError, AllOf},
    array::{
        error::{
            ParseEntityTypeReferenceArrayError, ParseOneOfArrayError,
            ParsePropertyTypeReferenceArrayError,
        },
        Array, ValueOrArray,
    },
    object::{error::ParsePropertyTypeObjectError, Object},
    one_of::{error::ParseOneOfError, OneOf},
    validate::{ValidateUrl, ValidationError},
};

// Re-export the repr contents so they're nicely grouped and so that they're easier to import in
// a non-ambiguous way where they don't get confused with their non repr counterparts.
// For example, `import crate::raw` lets you then use `raw::DataType`
#[allow(unreachable_pub, unused_imports)]
pub(crate) mod raw {
    pub use super::{
        data_type::raw::{DataType, DataTypeReference},
        entity_type::{
            links::raw::{Links, MaybeOneOfEntityTypeReference},
            raw::{EntityType, EntityTypeReference},
        },
        property_type::raw::{PropertyType, PropertyTypeReference, PropertyValues},
        shared::{
            all_of::raw::AllOf,
            array::raw::{Array, ValueOrArray},
            object::raw::Object,
            one_of::raw::OneOf,
        },
    };
}
