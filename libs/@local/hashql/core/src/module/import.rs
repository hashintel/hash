//! Module import and resolution system for HashQL.
//!
//! This module provides functionality for managing imports within the HashQL
//! language, including both absolute and relative imports, as well as the standard
//! prelude of built-in items.
use super::item::{ItemId, Universe};
use crate::symbol::InternedSymbol;

/// Represents a single import within a module.
///
/// An import associates a name with an item from the module registry.
/// It keeps track of the universe (type or value) of the imported item
/// to ensure proper resolution during type checking.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Import<'heap> {
    pub name: InternedSymbol<'heap>,

    pub item: ItemId,
    pub universe: Option<Universe>,
}
