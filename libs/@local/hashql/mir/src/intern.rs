use hashql_core::{heap::Heap, intern::InternSet, symbol::Symbol};

use crate::body::{local::Local, operand::Operand, place::Projection};

#[derive(Debug)]
pub struct Interner<'heap> {
    pub heap: &'heap Heap,

    pub locals: InternSet<'heap, [Local]>,
    pub symbols: InternSet<'heap, [Symbol<'heap>]>,
    pub operands: InternSet<'heap, [Operand<'heap>]>,
    pub projections: InternSet<'heap, [Projection<'heap>]>,
}

impl<'heap> Interner<'heap> {
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            heap,

            locals: InternSet::new(heap),
            symbols: InternSet::new(heap),
            operands: InternSet::new(heap),
            projections: InternSet::new(heap),
        }
    }
}
