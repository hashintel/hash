use core::ops::Index;

use crate::{
    collections::{FastHashMap, TinyVec},
    intern::Interned,
    symbol::Symbol,
    r#type::{
        TypeId,
        environment::{Environment, instantiate::InstantiateEnvironment},
        error::TypeCheckDiagnosticIssues,
        kind::generic::GenericArgumentReference,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TypeDef<'heap> {
    pub id: TypeId,
    pub arguments: Interned<'heap, [GenericArgumentReference<'heap>]>,
}

impl<'heap> TypeDef<'heap> {
    #[track_caller]
    pub fn instantiate(&mut self, env: &mut InstantiateEnvironment<'_, 'heap>) {
        self.id = env.instantiate(self.id);
        env.clear_provisioned();

        let Some(generic) = env.r#type(self.id).kind.generic() else {
            debug_assert!(self.arguments.is_empty(), "Expected no generics");
            return;
        };

        debug_assert_eq!(
            generic.arguments.len(),
            self.arguments.len(),
            "Unexpected number of generics"
        );

        let mut arguments = TinyVec::from_slice_copy(&self.arguments);

        for argument in &mut arguments {
            // Find the argument with the same name, for the small number of expected
            // generics we have a linear scan is the fastest, we cannot zip, because the type
            // implementation reserves the right to re-order the generic arguments.
            let Some(generic_argument) = generic
                .arguments
                .iter()
                .find(|generic_argument| generic_argument.name == argument.name)
            else {
                unreachable!()
            };

            *argument = generic_argument.as_reference();
        }

        self.arguments = env.intern_generic_argument_references(&arguments);
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Local<'heap, T> {
    pub name: Symbol<'heap>,
    pub value: T,
}

#[derive(Debug)]
pub struct Locals<'heap, T> {
    storage: Vec<Local<'heap, T>>,
    lookup: FastHashMap<Symbol<'heap>, usize>,
}

impl<'heap, T> Locals<'heap, T> {
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

    #[must_use]
    pub fn get(&self, name: Symbol<'heap>) -> Option<&Local<'heap, T>> {
        self.lookup.get(&name).map(|&index| &self.storage[index])
    }

    #[must_use]
    pub fn names(&self) -> impl IntoIterator<Item = Symbol<'heap>> + Clone + use<'_, 'heap, T> {
        self.lookup.keys().copied()
    }

    pub fn insert(&mut self, def: Local<'heap, T>) {
        let index = self.storage.len();
        let name = def.name;

        self.storage.push(def);
        self.lookup.insert(name, index);
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.storage.len()
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.storage.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &Local<'heap, T>> {
        self.storage.iter()
    }
}

impl<'heap> Locals<'heap, TypeDef<'heap>> {
    pub fn finish(&mut self, env: &Environment<'heap>) -> TypeCheckDiagnosticIssues {
        // Once finished we need to go over once to instantiate every call (now that everything is
        // properly set-up) to split the individual types from each other.
        let mut instantiate = InstantiateEnvironment::new(env);

        for def in &mut self.storage {
            def.value.instantiate(&mut instantiate);
        }

        instantiate.take_diagnostics()
    }
}

impl<'heap, T> Index<Symbol<'heap>> for Locals<'heap, T> {
    type Output = Local<'heap, T>;

    fn index(&self, index: Symbol<'heap>) -> &Self::Output {
        self.get(index).expect("local type not found")
    }
}

pub type TypeLocals<'heap> = Locals<'heap, TypeDef<'heap>>;

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct LocalBinding<'heap, T> {
    pub name: Symbol<'heap>,
    pub value: T,
}
