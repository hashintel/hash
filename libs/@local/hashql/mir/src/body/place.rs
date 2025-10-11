use hashql_core::{id, intern::Interned};

use super::local::Local;

id::newtype!(
    pub struct FieldIndex(usize is 0..=usize::MAX)
);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Place<'heap> {
    pub local: Local,
    pub projections: Interned<'heap, [Projection]>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Projection {
    Field(FieldIndex),
    Index(Local),
}
