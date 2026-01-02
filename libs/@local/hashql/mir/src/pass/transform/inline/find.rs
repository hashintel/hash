//! Callsite discovery for aggressive inlining.
//!
//! This module provides [`FindCallsiteVisitor`], which scans a function body to find
//! callsites that are eligible for aggressive inlining during the filter inlining phase.
//!
//! Unlike the normal phase which uses the call graph, the aggressive phase needs to
//! re-discover callsites after each inlining iteration because the body has changed.

use core::alloc::Allocator;

use super::{InlineState, InlineStateMemory};
use crate::{
    body::{constant::Constant, location::Location, operand::Operand, rvalue::Apply},
    def::DefId,
    pass::analysis::CallSite,
    visit::Visitor,
};

/// Visitor that finds eligible callsites for aggressive inlining.
///
/// Used during the aggressive inlining phase to discover new callsites in filter
/// functions after previous inlining iterations have modified the body.
///
/// A callsite is eligible if:
/// - It's a direct call (function is a constant `FnPtr`).
/// - Its target SCC has not already been inlined into this caller.
///
/// The SCC check prevents cycles: once we've inlined a function (or any function
/// in its SCC) into a filter, we won't inline it again.
pub(crate) struct FindCallsiteVisitor<'ctx, 'env, 'heap, A: Allocator> {
    /// The filter function we're finding callsites in.
    pub caller: DefId,

    /// Shared inlining state for SCC and inlined-set lookups.
    pub state: &'ctx InlineState<'env, 'heap, A>,
    /// Memory to collect discovered callsites into.
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
        // Only handle direct calls (constant function pointers).
        let &Operand::Constant(Constant::FnPtr(ptr)) = function else {
            return Ok(());
        };

        let target_component = self.state.components.scc(ptr);

        // Skip if we've already inlined this SCC into this caller.
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
