//! Provides a memory format similar to Arrows `Field`, `DataType`, and `Schema`.
//!
//! As only a selection of Arrow [`DataType`]s is supported at hEngine and additional constraints on
//! the Arrow column names are required to distinguish the different [`FieldSource`]s and
//! [`FieldScope`]s, this module abstracts over Arrow types. It defines [`FieldType`], which uses
//! Arrow types underneath and adds an `Any` type, which can represent arbitrary data and
//! [`FieldSpec`] to associate a name with the [`FieldType`].
//!
//! In order to use Arrows [`RecordBatch`] to use its memory format internally, an Arrow [`Schema`]
//! can be created from a [`FieldSpecMap`], which maps a [`RootFieldKey`]s to [`RootFieldSpec`]s. A
//! [`RootFieldSpec`] associates a [`FieldSpec`] with a [`FieldScope`] and a [`FieldSource`] and can
//! only nest [`FieldSpec`]s. The [`RootFieldKey`] contains the name of the corresponding field and
//! encodes the [`FieldScope`] and a [`FieldSource`] to be used for looking up Arrow columns.
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
    key::RootFieldKey,
    scope::FieldScope,
    source::FieldSource,
    spec::{FieldSpec, RootFieldSpec, RootFieldSpecCreator},
    spec_map::FieldSpecMap,
};
