use crate::knowledge::{Property, PropertyPath};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PropertyDiff<'e> {
    Added {
        path: PropertyPath<'e>,
        added: &'e Property,
    },
    Removed {
        path: PropertyPath<'e>,
        removed: &'e Property,
    },
    Changed {
        path: PropertyPath<'e>,
        old: &'e Property,
        new: &'e Property,
    },
}
