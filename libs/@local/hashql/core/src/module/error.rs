use core::fmt;

use super::{
    ModuleId, Universe,
    import::Import,
    item::{Item, ItemKind},
    resolver::Reference,
};
use crate::symbol::Symbol;

/// A set of item kinds that a name was found to exist as.
///
/// Used in resolution errors to report what a name actually resolves to
/// when the expected kind was not found. For example, when looking for a
/// value named `Url` that only exists as a type, the error can report
/// `expected: Value, found: KindSet::TYPE`.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Default)]
pub struct KindSet(u8);

impl KindSet {
    pub const EMPTY: Self = Self(0);
    pub const MODULE: Self = Self(0b100);
    pub const TYPE: Self = Self(0b010);
    pub const VALUE: Self = Self(0b001);

    #[must_use]
    pub const fn contains(self, other: Self) -> bool {
        self.0 & other.0 == other.0 && other.0 != 0
    }

    #[must_use]
    pub const fn union(self, other: Self) -> Self {
        Self(self.0 | other.0)
    }

    #[must_use]
    pub const fn is_empty(self) -> bool {
        self.0 == 0
    }

    /// Removes the kind corresponding to `universe` from this set.
    #[must_use]
    pub const fn without_universe(self, universe: Universe) -> Self {
        Self(self.0 & !Self::from_universe(universe).0)
    }

    /// Returns the `KindSet` for a single universe.
    #[must_use]
    pub const fn from_universe(universe: Universe) -> Self {
        match universe {
            Universe::Value => Self::VALUE,
            Universe::Type => Self::TYPE,
        }
    }

    /// Derives a `KindSet` from an [`ItemKind`].
    #[must_use]
    pub const fn from_item_kind(kind: &ItemKind<'_>) -> Self {
        match kind.universe() {
            None => Self::MODULE,
            Some(universe) => Self::from_universe(universe),
        }
    }
}

impl fmt::Debug for KindSet {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut first = true;
        f.write_str("KindSet(")?;
        for (flag, name) in [
            (Self::VALUE, "VALUE"),
            (Self::TYPE, "TYPE"),
            (Self::MODULE, "MODULE"),
        ] {
            if self.contains(flag) {
                if !first {
                    f.write_str(" | ")?;
                }
                f.write_str(name)?;
                first = false;
            }
        }
        if first {
            f.write_str("EMPTY")?;
        }
        f.write_str(")")
    }
}

impl fmt::Display for KindSet {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let has_value = self.contains(Self::VALUE);
        let has_type = self.contains(Self::TYPE);
        let has_module = self.contains(Self::MODULE);

        let mut parts = Vec::new();
        if has_value {
            parts.push("a value");
        }
        if has_type {
            parts.push("a type");
        }
        if has_module {
            parts.push("a module");
        }

        match parts.len() {
            0 => Ok(()),
            1 => f.write_str(parts[0]),
            2 => write!(f, "{} and {}", parts[0], parts[1]),
            _ => {
                for (index, part) in parts.iter().enumerate() {
                    if index > 0 {
                        f.write_str(", ")?;
                    }
                    if index == parts.len() - 1 {
                        f.write_str("and ")?;
                    }
                    f.write_str(part)?;
                }
                Ok(())
            }
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ResolutionSuggestion<'heap, T> {
    pub item: T,
    pub name: Symbol<'heap>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolutionError<'heap> {
    InvalidQueryLength {
        expected: usize,
    },
    ModuleRequired {
        depth: usize,
        found: Option<Universe>,
    },

    PackageNotFound {
        depth: usize,
        name: Symbol<'heap>,
        suggestions: Vec<ResolutionSuggestion<'heap, ModuleId>>,
    },
    ImportNotFound {
        depth: usize,
        name: Symbol<'heap>,
        /// The universe that was searched, if resolution was single-universe.
        /// `None` when all universes were searched (multi-mode).
        expected: Option<Universe>,
        /// What kinds the name actually exists as (when it was not found in
        /// the expected universe).
        found: KindSet,
        suggestions: Vec<ResolutionSuggestion<'heap, Import<'heap>>>,
    },

    ModuleNotFound {
        depth: usize,
        name: Symbol<'heap>,
        suggestions: Vec<ResolutionSuggestion<'heap, Item<'heap>>>,
    },

    ItemNotFound {
        depth: usize,
        name: Symbol<'heap>,
        /// The universe that was searched, if resolution was single-universe.
        /// `None` when all universes were searched (multi-mode).
        expected: Option<Universe>,
        /// What kinds the name actually exists as (when it was not found in
        /// the expected universe). For example, looking for value `Url` in a
        /// module that only exports it as a type yields `KindSet::TYPE`.
        found: KindSet,
        suggestions: Vec<ResolutionSuggestion<'heap, Item<'heap>>>,
    },

    Ambiguous(Reference<'heap>),

    ModuleEmpty {
        depth: usize,
    },
}
