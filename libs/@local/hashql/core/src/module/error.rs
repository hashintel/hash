use super::{
    ModuleId,
    import::Import,
    item::{Item, Universe},
};

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct Suggestion<T> {
    pub item: T,
    pub score: f64,
}

#[derive(Debug, Clone, PartialEq)]
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
        suggestions: Vec<Suggestion<ModuleId>>,
    },
    ImportNotFound {
        depth: usize,
        suggestions: Vec<Suggestion<Import<'heap>>>,
    },

    ModuleNotFound {
        depth: usize,
        suggestions: Vec<Suggestion<Item<'heap>>>,
    },

    ItemNotFound {
        depth: usize,
        suggestions: Vec<Suggestion<Item<'heap>>>,
    },

    Ambiguous(Item<'heap>),

    ModuleEmpty {
        depth: usize,
    },
}
