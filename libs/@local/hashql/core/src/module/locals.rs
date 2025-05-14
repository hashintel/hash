use crate::{
    collection::FastHashMap,
    symbol::Symbol,
    r#type::{
        TypeId,
        environment::{Diagnostics, Environment, instantiate::InstantiateEnvironment},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct LocalTypeDef<'heap> {
    pub id: TypeId,

    pub name: Symbol<'heap>,
}

#[derive(Debug)]
pub struct LocalTypes<'heap> {
    storage: Vec<LocalTypeDef<'heap>>,
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

    pub fn insert(&mut self, def: LocalTypeDef<'heap>) {
        let index = self.storage.len();
        self.storage.push(def);
        self.lookup.insert(def.name, index);
    }

    pub fn iter(&self) -> impl Iterator<Item = LocalTypeDef<'heap>> {
        self.storage.iter().copied()
    }

    pub fn finish(&mut self, env: &Environment<'heap>) -> Diagnostics {
        // Once finished we need to go over once to instantiate every call (now that everything is
        // properly set-up) to split the individual types from each other.
        let mut instantiate = InstantiateEnvironment::new(env);

        for LocalTypeDef { id, .. } in &mut self.storage {
            *id = instantiate.instantiate(*id);
            instantiate.clear_provisioned();

            // The problem is that for any type, the generic arguments would change, so we'd need to
            // recover them?
        }

        instantiate.take_diagnostics()
    }
}
