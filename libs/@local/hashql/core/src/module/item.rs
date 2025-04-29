use super::{ModuleId, ModuleRegistry};
use crate::{symbol::InternedSymbol, r#type::TypeId};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Universe {
    Type,
    Value,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IntrinsicItem {
    pub name: &'static str,
    pub universe: Universe,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ItemKind {
    Module(ModuleId),
    // In the future we'll also need to export values (like closures)
    // this would be done via a `DefId`/`ValueId` or similar
    Type(TypeId),
    Intrinsic(IntrinsicItem),
}

impl ItemKind {
    #[must_use]
    pub const fn universe(&self) -> Option<Universe> {
        match self {
            Self::Module(_) => None,
            Self::Type(_) => Some(Universe::Type),
            Self::Intrinsic(IntrinsicItem { universe, .. }) => Some(*universe),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Item<'heap> {
    pub parent: Option<ModuleId>,

    // TODO: move to Ident once Copy
    //  see: https://linear.app/hash/issue/H-4414/hashql-move-from-symbol-to-internedsymbol
    pub name: InternedSymbol<'heap>,
    pub kind: ItemKind,
}

impl<'heap> Item<'heap> {
    // TODO: when `gen` blocks have proper r-a support revisit this, currently, due to lifetime
    // constraints and recursive types this cannot be written as a simple iterator.
    pub fn search(
        &self,
        registry: &ModuleRegistry<'heap>,
        query: impl IntoIterator<Item = InternedSymbol<'heap>, IntoIter: Clone>,
    ) -> Vec<Self> {
        let mut query = query.into_iter();
        let Some(name) = query.next() else {
            return vec![*self];
        };

        let ItemKind::Module(module) = self.kind else {
            return Vec::new();
        };

        let module = registry.modules.index(module);
        let items = module.find(name);

        items
            .into_iter()
            .flat_map(move |item| item.search(registry, query.clone()))
            .collect()
    }
}
