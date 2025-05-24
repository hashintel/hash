use super::{ModuleId, Universe, import::Import, item::Item};
use crate::symbol::Symbol;

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
        suggestions: Vec<ResolutionSuggestion<'heap, Item<'heap>>>,
    },

    Ambiguous(Item<'heap>),

    ModuleEmpty {
        depth: usize,
    },
}
