use hashbrown::HashMap;

use crate::r#type::kind::generic_argument::{GenericArgumentData, GenericArgumentId};

#[derive(Debug)]
pub struct AuxiliaryData {
    pub arguments: HashMap<GenericArgumentId, GenericArgumentData, foldhash::fast::RandomState>,
}

impl AuxiliaryData {
    #[must_use]
    pub fn new() -> Self {
        Self {
            arguments: HashMap::default(),
        }
    }
}

impl Default for AuxiliaryData {
    fn default() -> Self {
        Self::new()
    }
}
