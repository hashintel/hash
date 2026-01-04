//! Callsite discovery for aggressive inlining.
//!
//! This module provides [`FindCallsiteVisitor`], which scans a function body to find
//! callsites that are eligible for aggressive inlining during the filter inlining phase.
//!
//! Unlike the normal phase which uses the call graph, the aggressive phase needs to
//! re-discover callsites after each inlining iteration because the body has changed.

use core::{alloc::Allocator, ops::ControlFlow};

use super::{BodyProperties, InlineState, InlineStateMemory};
use crate::{
    body::{Source, constant::Constant, location::Location, operand::Operand, rvalue::Apply},
    def::{DefId, DefIdSlice},
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
pub(crate) struct FindCallsiteVisitor<'ctx, 'state, 'env, 'heap, A: Allocator> {
    /// The filter function we're finding callsites in.
    pub caller: DefId,

    /// Shared inlining state for SCC and inlined-set lookups.
    pub state: &'ctx InlineState<'ctx, 'state, 'env, 'heap, A>,
    /// Memory to collect discovered callsites into.
    pub mem: &'ctx mut InlineStateMemory<A>,
}

impl<'heap, A: Allocator> Visitor<'heap> for FindCallsiteVisitor<'_, '_, '_, 'heap, A> {
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

pub(crate) struct FindApplyCall<'ctx, 'heap> {
    properties: &'ctx DefIdSlice<BodyProperties<'heap>>,
}

impl<'ctx, 'heap> FindApplyCall<'ctx, 'heap> {
    pub(crate) const fn new(properties: &'ctx DefIdSlice<BodyProperties<'heap>>) -> Self {
        Self { properties }
    }
}

impl<'heap> Visitor<'heap> for FindApplyCall<'_, 'heap> {
    type Result = ControlFlow<(), ()>;

    fn visit_rvalue_apply(
        &mut self,
        _: Location,
        Apply {
            function,
            arguments: _,
        }: &Apply<'heap>,
    ) -> Self::Result {
        // Only handle direct calls (constant function pointers).
        let &Operand::Constant(Constant::FnPtr(ptr)) = function else {
            return ControlFlow::Continue(());
        };

        let target_source = self.properties[ptr].source;
        if matches!(target_source, Source::Intrinsic(_)) {
            return ControlFlow::Continue(());
        }

        ControlFlow::Break(()) // We have found a call to a non-intrinsic function, and are therefore not a leaf
    }
}
