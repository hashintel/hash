use crate::{
    collection::FastHashMap,
    symbol::Symbol,
    r#type::{
        TypeId,
        environment::{Diagnostics, Environment, instantiate::InstantiateEnvironment},
    },
};

pub struct LocalTypes<'heap>(FastHashMap<Symbol<'heap>, TypeId>);

impl<'heap> LocalTypes<'heap> {
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self(FastHashMap::with_capacity_and_hasher(
            capacity,
            foldhash::fast::RandomState::default(),
        ))
    }

    pub fn insert(&mut self, symbol: Symbol<'heap>, type_id: TypeId) -> Option<TypeId> {
        self.0.insert(symbol, type_id)
    }

    pub fn iter(&self) -> impl Iterator<Item = (Symbol<'heap>, TypeId)> {
        self.0.iter().map(|(&symbol, &type_id)| (symbol, type_id))
    }

    pub fn finish(&mut self, env: &Environment<'heap>) -> Diagnostics {
        // Once finished we need to go over once to instantiate every call (now that everything is
        // properly set-up) to split the individual types from each other.
        let mut instantiate = InstantiateEnvironment::new(env);

        for type_id in self.0.values_mut() {
            *type_id = instantiate.instantiate(*type_id);
        }

        instantiate.take_diagnostics()
    }
}
