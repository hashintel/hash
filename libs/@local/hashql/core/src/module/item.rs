use super::Module;
use crate::{newtype, symbol::InternedSymbol, r#type::TypeId};

newtype!(
    pub struct ItemId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Universe {
    Type,
    Value,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IntrinsicItem<'heap> {
    pub name: InternedSymbol<'heap>,
    pub r#type: TypeId,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ItemKind<'heap> {
    Module(&'heap Module<'heap>),
    // In the future we'll also need to export values (like closures)
    // this would be done via a `DefId`/`ValueId` or similar
    Type(TypeId),
    Intrinsic(IntrinsicItem<'heap>),
}

impl ItemKind<'_> {
    #[must_use]
    pub const fn universe(&self) -> Option<Universe> {
        match self {
            ItemKind::Module(_) => None,
            ItemKind::Type(_) => Some(Universe::Type),
            ItemKind::Intrinsic(_) => Some(Universe::Value),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Item<'heap> {
    pub id: ItemId,

    pub kind: ItemKind<'heap>,
}
