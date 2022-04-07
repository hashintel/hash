//! Provides datastructures to organize field specifications and data types.
//!
//! Each supported data type is represented by a [`FieldType`]. It's associated with a name in
//! [`FieldSpec`]. Depending on the underlying [`FieldTypeVariant`], types may be nested.
//!
//! In order to store a [`FieldSpec`] into memory, a unique name is required, which is encapsulated
//! in [`RootFieldKey`]. This is mapped to a [`RootFieldSpec`] inside a [`FieldSpecMap`]. A
//! [`FieldSpecMap`] can be converted to an Arrow [`Schema`] to be stored in memory.
//!
//! For more information on these types please the the corresponding documentation.
//!
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
    key::RootFieldKey,
    scope::FieldScope,
    source::FieldSource,
    spec::{FieldSpec, RootFieldSpec, RootFieldSpecCreator},
    spec_map::FieldSpecMap,
};
