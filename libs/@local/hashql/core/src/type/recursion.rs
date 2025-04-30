use core::ops::ControlFlow;

use pretty::RcDoc;

use super::{
    Type, TypeId,
    environment::{AnalysisEnvironment, Environment},
    kind::TypeKind,
    pretty_print::PrettyPrint as _,
};
use crate::collection::FastHashSet;

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct RecursionDepthBoundary {
    pub depth: usize,
    pub limit: usize,
}

impl RecursionDepthBoundary {
    pub fn pretty<'this>(
        self,
        env: &'this Environment,
        id: TypeId,
    ) -> RcDoc<'this, anstyle::Style> {
        if self.depth >= self.limit {
            RcDoc::text("...")
        } else {
            env.r#type(id).pretty(env, self.enter())
        }
    }

    const fn enter(self) -> Self {
        Self {
            depth: self.depth + 1,
            limit: self.limit,
        }
    }
}

/// Recursive Cycle
///
/// Represents whether both ends of a recursive subtype check have been seen in the current call
/// stack, allowing coinductive discharge when a cycle is detected.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RecursionCycle {
    /// Was the left-hand type already on the stack.
    pub lhs: bool,
    /// Was the right-hand type already on the stack.
    pub rhs: bool,
}

impl RecursionCycle {
    /// Determine if we should discharge the cycle.
    pub(crate) const fn should_discharge(self) -> bool {
        self.lhs && self.rhs
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
struct RecursionStack<'heap>(Vec<(*const TypeKind<'heap>, usize)>);

impl<'heap> RecursionStack<'heap> {
    fn enter(&mut self, item: *const TypeKind<'heap>) {
        if let Some((entry, counter)) = self.0.last_mut()
            && core::ptr::eq(*entry, item)
        {
            *counter += 1;
        } else {
            self.0.push((item, 1));
        }
    }

    fn exit(&mut self, item: *const TypeKind<'heap>) {
        let (entry, counter) = self.0.last_mut().expect("should have at least one element");
        debug_assert!(core::ptr::eq(*entry, item));

        if *counter == 1 {
            self.0.pop();
        } else {
            *counter -= 1;
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct RecursionBoundary<'heap> {
    inner: FastHashSet<(*const TypeKind<'heap>, *const TypeKind<'heap>)>,
    // lhs: RecursionStack<'heap>,
    // rhs: RecursionStack<'heap>,
}

impl<'heap> RecursionBoundary<'heap> {
    pub(crate) fn new() -> Self {
        Self {
            inner: FastHashSet::default(),
            // lhs: RecursionStack::default(),
            // rhs: RecursionStack::default(),
        }
    }

    pub(crate) fn enter(&mut self, lhs: Type<'heap>, rhs: Type<'heap>) -> ControlFlow<()> {
        let lhs_kind = core::ptr::from_ref(lhs.kind);
        let rhs_kind = core::ptr::from_ref(rhs.kind);

        // Insert returns true if the element was not already in the set
        let should_enter = self.inner.insert((lhs_kind, rhs_kind));

        // Only insert if the element was not already in the set, otherwise our coinductive
        // recursion detection will always discharge.
        if should_enter {
            // self.lhs.enter(lhs_kind);
            // self.rhs.enter(rhs_kind);

            ControlFlow::Continue(())
        } else {
            ControlFlow::Break(())
        }
    }

    pub(crate) fn exit(&mut self, lhs: Type<'heap>, rhs: Type<'heap>) -> bool {
        let lhs_kind = core::ptr::from_ref(lhs.kind);
        let rhs_kind = core::ptr::from_ref(rhs.kind);

        // self.lhs.exit(lhs_kind);
        // self.rhs.exit(rhs_kind);

        self.inner.remove(&(lhs_kind, rhs_kind))
    }
}
