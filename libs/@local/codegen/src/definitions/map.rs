use specta::datatype;

use super::Type;

#[derive(Debug, Clone)]
pub struct Map {
    pub key: Box<Type>,
    pub value: Box<Type>,
}

impl Map {
    pub(crate) fn from_specta(
        map_type: &datatype::Map,
        type_collection: &specta::TypeCollection,
    ) -> Self {
        Self {
            key: Box::new(Type::from_specta(map_type.key_ty(), type_collection)),
            value: Box::new(Type::from_specta(map_type.value_ty(), type_collection)),
        }
    }
}
