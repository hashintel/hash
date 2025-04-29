use specta::datatype;

use super::Type;

#[derive(Debug, Clone)]
pub struct List {
    pub r#type: Box<Type>,
}

impl List {
    pub(crate) fn from_specta(
        list: &datatype::List,
        type_collection: &specta::TypeCollection,
    ) -> Self {
        Self {
            r#type: Box::new(Type::from_specta(list.ty(), type_collection)),
        }
    }
}
