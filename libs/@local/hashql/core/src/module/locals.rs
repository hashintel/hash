use crate::{
    collection::{FastHashMap, FastHashSet},
    symbol::Symbol,
    r#type::{
        TypeId,
        environment::{Diagnostics, Environment, instantiate::InstantiateEnvironment},
        kind::{GenericArgument, generic::GenericSubstitutions},
        visit::{Visitor, filter::Filter, walk_id},
    },
};

struct GenericArgumentInstantiateFilter;

impl Filter for GenericArgumentInstantiateFilter {
    const DEEP: bool = true;
    const GENERIC_PARAMETERS: bool = false;
    const MEMBERS: bool = false;
}

struct GenericArgumentVisitor<'env, 'heap> {
    env: &'env Environment<'heap>,
    arguments: &'env mut [GenericArgument<'heap>],
    visited: FastHashSet<TypeId>,
}

impl<'heap> Visitor<'heap> for GenericArgumentVisitor<'_, 'heap> {
    type Filter = GenericArgumentInstantiateFilter;

    fn env(&self) -> &Environment<'heap> {
        self.env
    }

    fn visit_id(&mut self, id: TypeId) {
        if !self.visited.insert(id) {
            return;
        }

        walk_id(self, id);
    }

    fn visit_generic_argument(&mut self, argument: GenericArgument<'heap>) {
        // Check if there's an argument of the same name in arguments and then set the id
        if let Some(arg) = self
            .arguments
            .iter_mut()
            .find(|current| current.name == argument.name)
        {
            arg.id = argument.id;
        }
    }

    fn visit_generic_substitutions(&mut self, _: GenericSubstitutions<'heap>) {
        // do not traverse down the substitutions, we're not interested in those nested types
    }
}

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
