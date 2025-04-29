use specta::datatype;

use super::Type;

#[derive(Debug, Clone)]
pub struct Tuple {
    pub elements: Vec<Type>,
}

impl Tuple {
    pub(crate) fn from_specta(
        tuple: &datatype::Tuple,
        type_collection: &specta::TypeCollection,
    ) -> Self {
        Self {
            elements: tuple
                .elements()
                .iter()
                .map(|element| Type::from_specta(element, type_collection))
                .collect(),
        }
    }
}
