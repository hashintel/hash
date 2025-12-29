//! Visitor for offsetting local indices during inlining.
//!
//! When inlining a callee's body into a caller, the callee's locals are appended to the
//! caller's `local_decls`. This visitor adjusts all local references in the inlined code
//! to point to their new positions.

use core::convert::Infallible;

use hashql_core::id::Id as _;

use crate::{
    body::{local::Local, location::Location, place::PlaceContext},
    intern::Interner,
    visit::{VisitorMut, r#mut::filter},
};

/// A MIR visitor that increments all [`Local`] indices by a fixed offset.
///
/// Used during inlining to remap callee locals to their new positions in the caller's
/// `local_decls`. For example, if the caller has 10 locals and we inline a callee with
/// 3 locals, the callee's `Local(0)`, `Local(1)`, `Local(2)` become `Local(10)`, `Local(11)`,
/// `Local(12)`.
pub(crate) struct OffsetLocalVisitor<'env, 'heap> {
    interner: &'env Interner<'heap>,
    offset: usize,
}

impl<'env, 'heap> OffsetLocalVisitor<'env, 'heap> {
    pub(crate) const fn new(interner: &'env Interner<'heap>, offset: usize) -> Self {
        Self { interner, offset }
    }
}

impl<'heap> VisitorMut<'heap> for OffsetLocalVisitor<'_, 'heap> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn visit_local(&mut self, _: Location, _: PlaceContext, local: &mut Local) -> Self::Result<()> {
        local.increment_by(self.offset);
        Ok(())
    }
}
