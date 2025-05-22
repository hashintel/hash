use core::iter;

use super::{Module, ModuleId, ModuleRegistry, Universe};
use crate::{
    symbol::Symbol,
    r#type::{TypeId, kind::GenericArgument},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IntrinsicItem {
    pub name: &'static str,
    pub universe: Universe,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ItemKind<'heap> {
    Module(ModuleId),
    // In the future we'll also need to export values (like closures)
    // this would be done via a `DefId`/`ValueId` or similar
    Type(TypeId, &'heap [GenericArgument<'heap>]),
    Intrinsic(IntrinsicItem),
}

impl ItemKind<'_> {
    #[must_use]
    pub const fn universe(&self) -> Option<Universe> {
        match self {
            Self::Module(_) => None,
            Self::Type(_, _) => Some(Universe::Type),
            Self::Intrinsic(IntrinsicItem { universe, .. }) => Some(*universe),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Item<'heap> {
    pub module: ModuleId,

    // TODO: move to Ident once Copy
    //  see: https://linear.app/hash/issue/H-4414/hashql-move-from-symbol-to-internedsymbol
    pub name: Symbol<'heap>,
    pub kind: ItemKind<'heap>,
}

impl<'heap> Item<'heap> {
    pub fn ancestors(
        &self,
        registry: &ModuleRegistry<'heap>,
    ) -> impl IntoIterator<Item = Module<'heap>> {
        let mut next = self.module;

        iter::from_fn(move || {
            if next == ModuleId::ROOT {
                return None;
            }

            let module = registry.modules.index(next);
            next = module.parent;

            Some(module)
        })
    }

    pub fn absolute_path(
        &self,
        registry: &ModuleRegistry<'heap>,
    ) -> impl Iterator<Item = Symbol<'heap>> {
        let mut modules: Vec<_> = self.ancestors(registry).into_iter().collect();
        modules.reverse();

        modules
            .into_iter()
            .map(|module| module.name)
            .chain(iter::once(self.name))
    }
}
