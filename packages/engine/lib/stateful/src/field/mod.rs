//! Provides datastructures to organize field specifications and data types.
//!
//! Fields are defined by their [`FieldSpec`], which encapsulates their name and [`FieldType`].
//! They can be nested depending on their [`FieldTypeVariant`]
//!
//! Top-level [`FieldSpec`]s (i.e. non-nested ones) have additional specification, defined in
//! [`RootFieldSpec`]. These have associated unique identifiers, [`RootFieldKey`]s, which are mapped
//! against their [`RootFieldSpec`] in a [`FieldSpecMap`]. The [`FieldSpecMap`] is then used to
//! generate an Arrow [`Schema`] to outline how the data is stored in memory.
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

/// We store Agent IDs in the UUID-byte format (not string bytes).
///
/// This means their length is 128 bits i.e. 16 bytes
pub const UUID_V4_LEN: usize = 16;
pub(in crate) const POSITION_DIM: usize = 3;

pub(in crate) use self::fixed_size::IsFixedSize;
pub use self::{
    accessor::FieldSpecMapAccessor,
    field_type::{FieldType, FieldTypeVariant, PresetFieldType},
    key::RootFieldKey,
    scope::FieldScope,
    source::{FieldSource, PackageId},
    spec::{FieldSpec, RootFieldSpec, RootFieldSpecCreator},
    spec_map::FieldSpecMap,
};
