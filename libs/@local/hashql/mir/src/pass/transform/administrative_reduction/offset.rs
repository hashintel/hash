use core::convert::Infallible;

use hashql_core::id::Id as _;

use crate::{
    body::{local::Local, location::Location, place::PlaceContext},
    intern::Interner,
    visit::{VisitorMut, r#mut::filter},
};

pub(crate) struct OffsetLocalVisitor<'env, 'heap> {
    interner: &'env Interner<'heap>,
    offset: usize,
}

impl<'env, 'heap> OffsetLocalVisitor<'env, 'heap> {
    pub(crate) fn new(interner: &'env Interner<'heap>, offset: usize) -> Self {
        Self { interner, offset }
    }
}

impl<'env, 'heap> VisitorMut<'heap> for OffsetLocalVisitor<'env, 'heap> {
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
