use crate::{
    heap::Heap,
    node::expr::Expr,
    visit::{Visitor, walk_expr},
};

mod paths {}

pub struct SpecialFormExpander<'heap> {
    heap: &'heap Heap,
}

impl<'heap> SpecialFormExpander<'heap> {
    pub const fn new(heap: &'heap Heap) -> Self {
        Self { heap }
    }
}

impl<'heap> Visitor<'heap> for SpecialFormExpander<'heap> {
    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        // First we walk the whole expression tree, and only then do we expand ourselves.
        walk_expr(self, expr);
    }
}
