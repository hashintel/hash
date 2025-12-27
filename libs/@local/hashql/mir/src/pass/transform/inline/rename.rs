use core::convert::Infallible;

use hashql_core::id::Id as _;

use crate::{
    body::{
        basic_block::BasicBlockId,
        local::Local,
        location::Location,
        place::PlaceContext,
        terminator::{Goto, Return, Target, Terminator, TerminatorKind},
    },
    intern::Interner,
    visit::{self, VisitorMut, r#mut::filter},
};

pub(crate) struct RenameVisitor<'env, 'heap> {
    pub local_offset: usize,
    pub bb_offset: usize,
    pub continuation: BasicBlockId,
    pub interner: &'env Interner<'heap>,
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

    fn visit_terminator(
        &mut self,
        location: Location,
        terminator: &mut Terminator<'heap>,
    ) -> Self::Result<()> {
        Ok(()) = visit::r#mut::walk_terminator(self, location, terminator);

        if let TerminatorKind::Return(Return { value }) = terminator.kind {
            terminator.kind = TerminatorKind::Goto(Goto {
                target: Target {
                    block: self.continuation,
                    args: self.interner.operands.intern_slice(&[value]),
                },
            });
        }

        Ok(())
    }
}
