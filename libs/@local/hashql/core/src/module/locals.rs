use crate::{
    collection::{FastHashMap, FastHashSet, TinyVec},
    symbol::Symbol,
    r#type::{
        TypeId,
        environment::{Diagnostics, Environment, instantiate::InstantiateEnvironment},
        kind::{
            GenericArgument,
            generic::{GenericArgumentId, GenericSubstitutions},
        },
        visit::{Visitor, filter::Filter, walk_id},
    },
};

struct GenericArgumentInstantiateFilter;

impl Filter for GenericArgumentInstantiateFilter {
    const DEEP: bool = true;
    const GENERIC_PARAMETERS: bool = false;
    const MEMBERS: bool = false;
}

struct GenericArgumentInstantiateVisitor<'env, 'heap> {
    env: &'env Environment<'heap>,
    arguments: &'env mut [GenericArgument<'heap>],
    unseen: FastHashSet<Symbol<'heap>>,
    visited: FastHashSet<TypeId>,
}

impl<'env, 'heap> GenericArgumentInstantiateVisitor<'env, 'heap> {
    fn new(env: &'env Environment<'heap>, arguments: &'env mut [GenericArgument<'heap>]) -> Self {
        let unseen = arguments
            .iter()
            .map(|&GenericArgument { name, .. }| name)
            .collect();

        Self {
            env,
            arguments,
            unseen,
            visited: FastHashSet::default(),
        }
    }
}

impl<'heap> Visitor<'heap> for GenericArgumentInstantiateVisitor<'_, 'heap> {
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
        if let Some(found) = self
            .arguments
            .iter_mut()
            .find(|current| current.name == argument.name)
        {
            // TODO: is it a bug tho?! what happens if we instantiate a generic argument that's
            // present in both!?
            if !self.unseen.remove(&found.name) {
                tracing::error!(%found.name, "Duplicate generic argument, this is likely a bug");
            }

            found.id = argument.id;
        }
    }

    fn visit_generic_substitutions(&mut self, _: GenericSubstitutions<'heap>) {
        // do not traverse down the substitutions, we're not interested in those nested types
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LocalTypeDef<'heap> {
    pub id: TypeId,

    pub name: Symbol<'heap>,
    pub arguments: TinyVec<GenericArgument<'heap>>,
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
        let name = def.name;

        self.storage.push(def);
        self.lookup.insert(name, index);
    }

    pub fn iter(&self) -> impl Iterator<Item = &LocalTypeDef<'heap>> {
        self.storage.iter()
    }

    pub fn finish(&mut self, env: &Environment<'heap>) -> Diagnostics {
        // Once finished we need to go over once to instantiate every call (now that everything is
        // properly set-up) to split the individual types from each other.
        let mut instantiate = InstantiateEnvironment::new(env);

        for LocalTypeDef { id, arguments, .. } in &mut self.storage {
            *id = instantiate.instantiate(*id);
            instantiate.clear_provisioned();

            let mut visitor = GenericArgumentInstantiateVisitor::new(env, arguments);
            visitor.visit_id(*id);
            if !visitor.unseen.is_empty() {
                tracing::error!(?visitor.unseen, "During instantiation found generic arguments that haven't been visited, this is likely a bug");
            }
        }

        instantiate.take_diagnostics()
    }
}
