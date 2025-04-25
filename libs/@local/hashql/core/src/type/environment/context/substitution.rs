use crate::r#type::{
    TypeId,
    collection::FastHashMap,
    kind::{generic_argument::GenericArgumentId, infer::HoleId},
};

// The result post inference step (to be implemented)
#[derive(Debug)]
pub struct Substitution {
    arguments: FastHashMap<GenericArgumentId, TypeId>,
    inference: FastHashMap<HoleId, TypeId>,
}

impl Substitution {
    #[must_use]
    pub fn new() -> Self {
        Self {
            arguments: FastHashMap::default(),
            inference: FastHashMap::default(),
        }
    }

    #[must_use]
    pub fn argument(&self, id: GenericArgumentId) -> Option<TypeId> {
        self.arguments.get(&id).copied()
    }

    #[must_use]
    pub fn infer(&self, id: HoleId) -> Option<TypeId> {
        self.inference.get(&id).copied()
    }
}

impl Default for Substitution {
    fn default() -> Self {
        Self::new()
    }
}
