//! Module import and resolution system for HashQL.
//!
//! This module provides functionality for managing imports within the HashQL
//! language, including both absolute and relative imports, as well as the standard
//! prelude of built-in items.
use core::marker::PhantomData;

use ena::snapshot_vec::SnapshotVecDelegate;

use super::item::Item;
use crate::symbol::InternedSymbol;

/// Represents a single import within a module.
///
/// An import associates a name with an item from the module registry.
/// It keeps track of the universe (type or value) of the imported item
/// to ensure proper resolution during type checking.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Import<'heap> {
    pub name: InternedSymbol<'heap>,

    pub item: Item<'heap>,
}

// This needs to be a separate struct, as to not leak `ena` as a dependency
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ImportDelegate<'heap>(PhantomData<&'heap ()>);

impl<'heap> SnapshotVecDelegate for ImportDelegate<'heap> {
    type Undo = ();
    type Value = Import<'heap>;

    fn reverse(_: &mut Vec<Self::Value>, (): ()) {}
}
