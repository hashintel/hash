//! Provides an hEngine-specific representation of Arrows `Field` and `DataType`.
//!
//! As we are using only a subset of types provided by `Arrow`, our types are represented by
//! [`FieldType`] rather than [`arrow::DataType`]. As [`FieldType`] can't be used in
//! [`arrow::Field`], this module provides [`FieldSpec`] instead.
//!
//! For naming a [`FieldSpec`], [`FieldKey`] is provided, as a name has strict requirements on how
//! it's built.

mod field_type;
mod fixed_size;
mod key;
mod scope;
mod source;
mod spec;

pub const UUID_V4_LEN: usize = 16;

pub use self::{
    field_type::{FieldType, FieldTypeVariant, PresetFieldType},
    fixed_size::IsFixedSize,
    key::{FieldKey, HIDDEN_PREFIX, PRIVATE_PREFIX},
    scope::FieldScope,
    source::FieldSource,
    spec::FieldSpec,
};
