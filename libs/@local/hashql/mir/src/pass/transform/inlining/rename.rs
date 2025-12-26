use core::convert::Infallible;

use hashql_core::id::Id as _;

use crate::{
    body::{basic_block::BasicBlockId, local::Local, location::Location, place::PlaceContext},
    intern::Interner,
    visit::{VisitorMut, r#mut::filter},
};

pub(crate) struct RenameVisitor<'env, 'heap> {
    local_offset: usize,
    bb_offset: usize,
    interner: &'env Interner<'heap>,
}

impl<'env, 'heap> RenameVisitor<'env, 'heap> {
    pub(crate) const fn new(
        local_offset: usize,
        bb_offset: usize,
        interner: &'env Interner<'heap>,
    ) -> Self {
        Self {
            local_offset,
            bb_offset,
            interner,
        }
    }
}

impl<'heap> VisitorMut<'heap> for RenameVisitor<'_, 'heap> {
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
        local.increment_by(self.local_offset);
        Ok(())
    }

    fn visit_basic_block_id(
        &mut self,
        _: Location,
        basic_block_id: &mut BasicBlockId,
    ) -> Self::Result<()> {
        basic_block_id.increment_by(self.bb_offset);
        Ok(())
    }
}
