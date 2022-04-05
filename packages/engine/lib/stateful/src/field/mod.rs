//! Provides an hEngine-specific representation of Arrows `Field` and `DataType`.
//!
//! As only a selection of [`arrow::DataType`]s is provided to hEngine, this module defines
//! [`FieldType`], which uses Arrow types underneath and adds an `Any` type, which internally uses
//! a JSON encoded `String` type. As [`FieldType`] can't be used in [`arrow::Field`], this module
//! provides [`FieldSpec`] to associate a name with the [`FieldType`].
//!
//! For naming a [`FieldSpec`], [`FieldKey`] is provided, as a name has strict requirements on how
//! it's built. [`FieldKey`] is a unique identifier for a given name in a provided [`FieldScope`]
//! and its [`FieldSource`].

mod accessor;
mod field_type;
mod fixed_size;
mod key;
mod scope;
mod source;
mod spec;
mod spec_map;

pub const UUID_V4_LEN: usize = 16;

pub use self::{
    accessor::{FieldSpecMapAccessor, RootFieldSpecMapAccessor},
    field_type::{FieldType, FieldTypeVariant, PresetFieldType},
    fixed_size::IsFixedSize,
    key::{FieldKey, HIDDEN_PREFIX, PRIVATE_PREFIX},
    scope::FieldScope,
    source::FieldSource,
    spec::{FieldSpec, RootFieldSpec, RootFieldSpecCreator},
    spec_map::FieldSpecMap,
};
