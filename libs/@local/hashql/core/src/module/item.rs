use super::{Module, ModuleId};
use crate::{newtype, newtype_producer, symbol::InternedSymbol, r#type::TypeId};

newtype!(pub struct ItemId(u32 is 0..=0xFFFF_FF00));
newtype_producer!(pub(super) struct ItemIdProducer(ItemId));

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
pub enum ItemKind<'heap> {
    Module(&'heap Module<'heap>),
    // In the future we'll also need to export values (like closures)
    // this would be done via a `DefId`/`ValueId` or similar
    Type(TypeId),
    Intrinsic(IntrinsicItem),
}

impl ItemKind<'_> {
    #[must_use]
    pub const fn universe(&self) -> Option<Universe> {
        match self {
            ItemKind::Module(_) => None,
            ItemKind::Type(_) => Some(Universe::Type),
            ItemKind::Intrinsic(IntrinsicItem { universe, .. }) => Some(*universe),
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
    pub kind: ItemKind<'heap>,
}
