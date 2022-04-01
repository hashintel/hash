//! TODO: DOC

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
    key::FieldKey,
    scope::FieldScope,
    source::FieldSource,
    spec::FieldSpec,
};
