use super::ModuleId;
use crate::{id::HasId, newtype, symbol::InternedSymbol, r#type::TypeId};

newtype!(pub struct ItemId(u32 is 0..=0xFFFF_FF00));

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
    pub id: ItemId,
    pub parent: ModuleId,

    // TODO: move to Ident once Copy
    //  see: https://linear.app/hash/issue/H-4414/hashql-move-from-symbol-to-internedsymbol
    pub name: InternedSymbol<'heap>,
    pub kind: ItemKind,
}

impl HasId for Item<'_> {
    type Id = ItemId;

    fn id(&self) -> Self::Id {
        self.id
    }
}
