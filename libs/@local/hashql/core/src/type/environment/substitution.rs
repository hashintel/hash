use hashbrown::HashMap;

use crate::r#type::{TypeId, kind::generic_argument::GenericArgumentId};

// The result post inference step (to be implemented)
#[derive(Debug)]
pub struct Substitution {
    arguments: HashMap<GenericArgumentId, TypeId, foldhash::fast::RandomState>,
    inference: HashMap<TypeId, TypeId, foldhash::fast::RandomState>,
}

impl Substitution {
    #[must_use]
    pub fn new() -> Self {
        Self {
            arguments: HashMap::default(),
            inference: HashMap::default(),
        }
    }

    #[must_use]
    pub fn argument(&self, id: GenericArgumentId) -> Option<TypeId> {
        self.arguments.get(&id).copied()
    }

    #[must_use]
    pub fn infer(&self, id: TypeId) -> Option<TypeId> {
        self.inference.get(&id).copied()
    }
}

impl Default for Substitution {
    fn default() -> Self {
        Self::new()
    }
}
