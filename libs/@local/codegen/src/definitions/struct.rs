use specta::datatype;

use super::Fields;

#[derive(Debug, Clone)]
pub struct Struct {
    pub fields: Fields,
}

impl Struct {
    pub(crate) fn from_specta(
        struct_type: &datatype::Struct,
        type_collection: &specta::TypeCollection,
    ) -> Self {
        Self {
            fields: Fields::from_specta(struct_type.fields(), type_collection),
        }
    }
}
