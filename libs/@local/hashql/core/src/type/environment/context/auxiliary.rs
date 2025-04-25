use crate::r#type::{
    collection::FastHashMap,
    kind::generic_argument::{GenericArgumentData, GenericArgumentId},
};

#[derive(Debug)]
pub struct AuxiliaryData {
    pub arguments: FastHashMap<GenericArgumentId, GenericArgumentData>,
}

impl AuxiliaryData {
    #[must_use]
    pub fn new() -> Self {
        Self {
            arguments: FastHashMap::default(),
        }
    }
}

impl Default for AuxiliaryData {
    fn default() -> Self {
        Self::new()
    }
}
