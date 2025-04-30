use core::{marker::PhantomData, ops::ControlFlow};

use hashbrown::{HashSet, hash_map::Entry};
use pretty::RcDoc;

use super::{
    Type, TypeId, environment::Environment, kind::TypeKind, pretty_print::PrettyPrint as _,
};
use crate::collection::{FastHashMap, FastHashSet};

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
    lhs: bool,
    /// Was the right-hand type already on the stack.
    rhs: bool,
}

impl RecursionCycle {
    /// Determine if we should discharge the cycle.
    pub(crate) const fn should_discharge(self) -> bool {
        self.lhs && self.rhs
    }
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RecursionBoundary<'heap> {
    inner: FastHashSet<(*const TypeKind<'heap>, *const TypeKind<'heap>)>,

    lhs: FastHashMap<*const TypeKind<'heap>, usize>,
    rhs: FastHashMap<*const TypeKind<'heap>, usize>,
}

impl<'heap> RecursionBoundary<'heap> {
    pub(crate) fn new() -> Self {
        Self {
            inner: FastHashSet::default(),
            lhs: FastHashMap::default(),
            rhs: FastHashMap::default(),
        }
    }

    pub(crate) fn reset(&mut self) {
        self.inner.clear();
        self.lhs.clear();
        self.rhs.clear();
    }

    pub(crate) fn enter(
        &mut self,
        lhs: Type<'heap>,
        rhs: Type<'heap>,
    ) -> ControlFlow<RecursionCycle> {
        let lhs_kind = core::ptr::from_ref(lhs.kind);
        let rhs_kind = core::ptr::from_ref(rhs.kind);

        // Insert returns true if the element was not already in the set
        let should_enter = self.inner.insert((lhs_kind, rhs_kind));

        // Only insert if the element was not already in the set, otherwise our coinductive
        // recursion detection will always discharge.
        if should_enter {
            *self.lhs.entry(lhs_kind).or_default() += 1;
            *self.rhs.entry(rhs_kind).or_default() += 1;

            ControlFlow::Continue(())
        } else {
            let cycle = RecursionCycle {
                lhs: self.lhs.contains_key(&lhs_kind),
                rhs: self.rhs.contains_key(&rhs_kind),
            };

            println!("Cycle detected: {:?}", cycle);

            ControlFlow::Break(cycle)
        }
    }

    pub(crate) fn exit(&mut self, lhs: Type<'heap>, rhs: Type<'heap>) -> bool {
        let lhs_kind = core::ptr::from_ref(lhs.kind);
        let rhs_kind = core::ptr::from_ref(rhs.kind);

        if let Entry::Occupied(mut entry) = self.lhs.entry(lhs_kind) {
            let value = entry.get_mut();
            if *value == 1 {
                entry.remove();
            } else {
                *value -= 1;
            }
        }
        if let Entry::Occupied(mut entry) = self.rhs.entry(rhs_kind) {
            let value = entry.get_mut();
            if *value == 1 {
                entry.remove();
            } else {
                *value -= 1;
            }
        }

        self.inner.remove(&(lhs_kind, rhs_kind))
    }
}
