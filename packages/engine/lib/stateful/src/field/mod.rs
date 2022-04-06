//! Provides an hEngine-specific representation of Arrows `Field`, `DataType`, and `Schema`.
//!
//! As only a selection of Arrow [`DataType`]s is supported at hEngine, this module defines
//! [`FieldType`], which uses Arrow types underneath and adds an `Any` type, which can represent
//! arbitrary data. As [`FieldType`] can't be used in Arrows [`Field`], this module provides
//! [`FieldSpec`] to associate a name with the [`FieldType`].
//!
//! To create an Arrow [`Schema`], this module provides a [`FieldSpecMap`], which maps a
//! [`FieldKey`]s to [`RootFieldSpec`]s. A [`RootFieldSpec`] associates a [`FieldSpec`] with a
//! [`FieldScope`] and a [`FieldSource`]. The [`FieldKey`] contains the name of the corresponding
//! field and encodes the [`FieldScope`] and a [`FieldSource`] to be used for looking up Arrow
//! columns.
//!
//!
//!
//! For more information on these types please the the corresponding documentation.
//!
//! [`DataType`]: arrow::datatypes::DataType
//! [`Field`]: arrow::datatypes::Field
//! [`Schema`]: arrow::datatypes::Schema

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
    key::FieldKey,
    scope::FieldScope,
    source::FieldSource,
    spec::{FieldSpec, RootFieldSpec, RootFieldSpecCreator},
    spec_map::FieldSpecMap,
};
