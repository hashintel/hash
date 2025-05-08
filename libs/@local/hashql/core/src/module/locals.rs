use crate::{
    collection::FastHashMap,
    symbol::Symbol,
    r#type::{
        TypeId,
        environment::{Diagnostics, Environment, instantiate::InstantiateEnvironment},
    },
};

pub struct LocalTypes<'heap> {
    storage: Vec<(Symbol<'heap>, TypeId)>,
    lookup: FastHashMap<Symbol<'heap>, usize>,
}

impl<'heap> LocalTypes<'heap> {
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            storage: Vec::with_capacity(capacity),
            lookup: FastHashMap::with_capacity_and_hasher(
                capacity,
                foldhash::fast::RandomState::default(),
            ),
        }
    }

    pub fn insert(&mut self, symbol: Symbol<'heap>, type_id: TypeId) {
        let index = self.storage.len();
        self.storage.push((symbol, type_id));
        self.lookup.insert(symbol, index);
    }

    pub fn iter(&self) -> impl Iterator<Item = (Symbol<'heap>, TypeId)> {
        self.storage.iter().copied()
    }

    pub fn finish(&mut self, env: &Environment<'heap>) -> Diagnostics {
        // Once finished we need to go over once to instantiate every call (now that everything is
        // properly set-up) to split the individual types from each other.
        let mut instantiate = InstantiateEnvironment::new(env);

        for (_, type_id) in &mut self.storage {
            *type_id = instantiate.instantiate(*type_id);
            instantiate.clear_provisioned();
        }

        instantiate.take_diagnostics()
    }
}
