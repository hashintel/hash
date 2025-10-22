use hashql_core::{heap::Heap, intern::InternSet, symbol::Symbol};

use crate::body::{local::Local, place::Projection};

#[derive(Debug)]
pub struct Interner<'heap> {
    pub locals: InternSet<'heap, [Local]>,
    pub symbols: InternSet<'heap, [Symbol<'heap>]>,
    pub projections: InternSet<'heap, [Projection<'heap>]>,
}

impl<'heap> Interner<'heap> {
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            locals: InternSet::new(heap),
            symbols: InternSet::new(heap),
            projections: InternSet::new(heap),
        }
    }
}
