use pretty::RcDoc;

use crate::{
    collection::{FastHashMap, TinyVec},
    symbol::Symbol,
    r#type::{
        TypeId,
        environment::{Diagnostics, Environment, instantiate::InstantiateEnvironment},
        kind::generic::GenericArgumentReference,
        pretty_print::PrettyPrint,
        recursion::RecursionDepthBoundary,
    },
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LocalTypeDef<'heap> {
    pub id: TypeId,

    pub name: Symbol<'heap>,
    pub arguments: TinyVec<GenericArgumentReference<'heap>>,
}

impl<'heap> LocalTypeDef<'heap> {
    fn instantiate(&mut self, env: &mut InstantiateEnvironment<'_, 'heap>) {
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

        for argument in &mut self.arguments {
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
    }
}

impl PrettyPrint for LocalTypeDef<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'env, anstyle::Style> {
        RcDoc::text("type")
            .append(RcDoc::line())
            .append(RcDoc::as_string(self.name))
            .append(match self.arguments.as_slice() {
                [] => RcDoc::nil(),
                _ => RcDoc::text("<")
                    .append(RcDoc::intersperse(
                        self.arguments
                            .iter()
                            .map(|argument| argument.pretty(env, limit)),
                        RcDoc::text(",").append(RcDoc::line()),
                    ))
                    .append(RcDoc::text(">")),
            })
            .group()
            .append(RcDoc::line())
            .append("=")
            .append(RcDoc::line())
            .append(limit.pretty(env, self.id))
            .group()
    }
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

        for def in &mut self.storage {
            def.instantiate(&mut instantiate);
        }

        instantiate.take_diagnostics()
    }
}
