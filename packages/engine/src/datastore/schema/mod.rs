pub mod context;
pub mod state;

mod field_spec;

pub use field_spec::{
    accessor, builder::FieldSpecMapBuilder, built_in::IsRequired, short_json::ShortJSONError,
    FieldKey, FieldScope, FieldSource, FieldSpec, FieldSpecMap, FieldType, FieldTypeVariant,
    PresetFieldType,
};
// TODO[2] move FieldSpecMap here
pub(in crate::datastore) use field_spec::RootFieldSpec;
