use core::iter;

use super::{Module, ModuleId, ModuleRegistry, Universe, locals::TypeDef};
use crate::symbol::Symbol;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IntrinsicValue<'heap> {
    pub name: &'static str,
    pub r#type: TypeDef<'heap>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IntrinsicType {
    pub name: &'static str,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::From)]
pub enum IntrinsicItem<'heap> {
    Value(IntrinsicValue<'heap>),
    Type(IntrinsicType),
}

impl IntrinsicItem<'_> {
    pub const fn universe(&self) -> Universe {
        match self {
            Self::Value(_) => Universe::Value,
            Self::Type(_) => Universe::Type,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ConstructorItem<'heap> {
    // The type this constructor creates
    pub r#type: TypeDef<'heap>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::From)]
pub enum ItemKind<'heap> {
    #[from]
    Module(ModuleId),

    // In the future we'll also need to export values (like closures)
    // this would be done via a `DefId`/`ValueId` or similar
    #[from]
    Type(TypeDef<'heap>),

    // In the future we would want to export this as a proper value, using a specialized
    // `TypeConstructor` will work for now.
    #[from]
    Constructor(ConstructorItem<'heap>),

    #[from(forward)]
    Intrinsic(IntrinsicItem<'heap>),
}

impl ItemKind<'_> {
    #[must_use]
    pub const fn universe(&self) -> Option<Universe> {
        match self {
            Self::Module(_) => None,
            Self::Type(_) => Some(Universe::Type),
            Self::Constructor(_) => Some(Universe::Value),
            Self::Intrinsic(item) => Some(item.universe()),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Item<'heap> {
    pub module: ModuleId,

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
