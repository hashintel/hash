//! Module import and resolution system for HashQL.
//!
//! This module provides functionality for managing imports within the HashQL
//! language, including both absolute and relative imports, as well as the standard
//! prelude of built-in items.
use core::marker::PhantomData;

use ena::snapshot_vec::SnapshotVecDelegate;

use super::{Universe, item::Item, locals::LocalBinding, resolver::Reference};
use crate::symbol::Symbol;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ImportReference<'heap> {
    Binding(Universe),
    Item(Item<'heap>),
}

impl<'heap> ImportReference<'heap> {
    pub(crate) const fn universe(&self) -> Option<Universe> {
        match self {
            Self::Binding(universe) => Some(*universe),
            Self::Item(item) => item.kind.universe(),
        }
    }

    pub(crate) const fn from_reference(item: Reference<'heap>) -> Self {
        match item {
            Reference::Binding(binding) => Self::Binding(binding.value),
            Reference::Item(item) => Self::Item(item),
        }
    }
}

/// Represents a single import within a module.
///
/// An import associates a name with an item from the module registry.
/// It keeps track of the universe (type or value) of the imported item
/// to ensure proper resolution during type checking.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Import<'heap> {
    pub name: Symbol<'heap>,

    pub item: ImportReference<'heap>,
}

impl<'heap> Import<'heap> {
    pub(crate) const fn into_reference(self) -> Reference<'heap> {
        match self.item {
            ImportReference::Binding(universe) => Reference::Binding(LocalBinding {
                name: self.name,
                value: universe,
            }),
            ImportReference::Item(item) => Reference::Item(item),
        }
    }

    pub(crate) const fn into_item(self) -> Option<Item<'heap>> {
        match self.item {
            ImportReference::Binding(_) => None,
            ImportReference::Item(item) => Some(item),
        }
    }
}

// This needs to be a separate struct, as to not leak `ena` as a dependency
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ImportDelegate<'heap>(PhantomData<&'heap ()>);

impl<'heap> SnapshotVecDelegate for ImportDelegate<'heap> {
    type Undo = ();
    type Value = Import<'heap>;

    fn reverse(_: &mut Vec<Self::Value>, (): ()) {}
}
