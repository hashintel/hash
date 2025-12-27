use core::alloc::Allocator;

use super::{InlineState, InlineStateMemory};
use crate::{
    body::{constant::Constant, location::Location, operand::Operand, rvalue::Apply},
    def::DefId,
    pass::analysis::CallSite,
    visit::Visitor,
};

pub(crate) struct FindCallsiteVisitor<'ctx, 'env, 'heap, A: Allocator> {
    pub caller: DefId,

    pub state: &'ctx InlineState<'env, 'heap, A>,
    pub mem: &'ctx mut InlineStateMemory<A>,
}

impl<'heap, A: Allocator> Visitor<'heap> for FindCallsiteVisitor<'_, '_, 'heap, A> {
    type Result = Result<(), !>;

    fn visit_rvalue_apply(
        &mut self,
        location: Location,
        Apply {
            function,
            arguments: _,
        }: &Apply<'heap>,
    ) -> Self::Result {
        let &Operand::Constant(Constant::FnPtr(ptr)) = function else {
            return Ok(());
        };

        let target_component = self.state.components.scc(ptr);

        // Check if the function is in the same component already, if that is the case, then we
        // cannot inline it
        if self.state.inlined.contains(self.caller, target_component) {
            return Ok(());
        }

        self.mem.callsites.push(CallSite {
            caller: self.caller,
            kind: location,
            target: ptr,
        });

        Ok(())
    }
}
