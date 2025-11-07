//! Branch terminator representation for HashQL MIR.
//!
//! Branch terminators represent conditional control flow operations that
//! evaluate a boolean condition and transfer control to one of two possible
//! target basic blocks based on the result.

use core::{cmp::Ordering, iter, mem};

use hashql_core::{algorithms::co_sort, heap};

use super::Target;
use crate::body::operand::Operand;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct SwitchIf<'heap> {
    pub then: Target<'heap>,
    pub r#else: Target<'heap>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SwitchTargets<'heap> {
    // TODO: in the future we might want to use `SmallVec<_, 2>` here as that is the common case
    values: heap::Vec<'heap, u128>,
    targets: heap::Vec<'heap, Target<'heap>>,
}

impl<'heap> SwitchTargets<'heap> {
    #[must_use]
    pub fn new(
        heap: &'heap heap::Heap,
        targets: impl IntoIterator<Item = (u128, Target<'heap>)>,
        otherwise: Option<Target<'heap>>,
    ) -> Self {
        let mut collect = (heap::Vec::new_in(heap), heap::Vec::new_in(heap));
        targets.into_iter().collect_into(&mut collect);
        let (mut values, mut targets) = collect;

        co_sort(&mut values, &mut targets);

        if let Some(otherwise) = otherwise {
            targets.push(otherwise);
        }

        Self { values, targets }
    }

    #[must_use]
    pub fn new_if(heap: &'heap heap::Heap, then: Target<'heap>, r#else: Target<'heap>) -> Self {
        let mut values = heap::Vec::with_capacity_in(2, heap);
        values.push(0);
        values.push(1);

        let mut targets = heap::Vec::with_capacity_in(2, heap);
        targets.push(r#else);
        targets.push(then);

        Self { values, targets }
    }

    #[must_use]
    pub fn as_if(&self) -> Option<SwitchIf<'heap>> {
        if let [0, 1] = self.values[..]
            && let [r#else, then] = self.targets[..]
        {
            return Some(SwitchIf { then, r#else });
        }

        None
    }

    const fn has_otherwise(&self) -> bool {
        self.values.len() == self.targets.len()
    }

    #[must_use]
    pub fn otherwise(&self) -> Option<Target<'heap>> {
        self.targets.get(self.values.len()).copied()
    }

    #[must_use]
    pub fn target(&self, value: u128) -> Option<Target<'heap>> {
        self.values
            .binary_search(&value)
            .ok()
            .map(|i| self.targets[i])
            .or_else(|| self.otherwise())
    }

    #[must_use]
    pub fn targets(&self) -> &[Target<'heap>] {
        &self.targets
    }

    pub fn targets_mut(&mut self) -> &mut [Target<'heap>] {
        &mut self.targets
    }

    #[must_use]
    pub fn values(&self) -> &[u128] {
        &self.values
    }

    // We do not expose an `values_mut` method because transformations could violate the ordering
    // guarantees.
    pub fn increment_values(&mut self, increment: u128) {
        for value in &mut self.values {
            *value += increment;
        }
    }

    #[must_use]
    pub fn iter(
        &self,
    ) -> impl DoubleEndedIterator<Item = (u128, Target<'heap>)> + ExactSizeIterator {
        iter::zip(&self.values, &self.targets).map(|(&value, &target)| (value, target))
    }

    pub fn remove_target(&mut self, value: u128) -> Option<Target<'heap>> {
        let index = self.values.binary_search(&value).ok()?;

        self.values.remove(index);
        let target = self.targets.remove(index);

        Some(target)
    }

    pub fn add_target(&mut self, value: u128, target: Target<'heap>) {
        let index = self
            .values
            .binary_search(&value)
            .expect_err("duplicate switch target value");

        self.values.insert(index, value);
        self.targets.insert(index, target);
    }

    pub fn append(&mut self, other: &mut Self) {
        let otherwise = match (self.has_otherwise(), other.has_otherwise()) {
            (true, true) => panic!("cannot append if both targets have an otherwise branch"),
            (true, false) => self.targets.pop(),
            (false, true) => other.targets.pop(),
            (false, false) => None,
        };

        // Make sure that both no longer have an otherwise target
        debug_assert_eq!(self.values.len(), self.targets.len());
        debug_assert_eq!(other.values.len(), other.targets.len());

        if other.values.is_empty() {
            // nothing to do
        } else if self.values.is_empty() {
            // self is empty, so we can just swap the targets
            mem::swap(self, other);
        } else {
            let self_len = self.values.len();

            self.values.append(&mut other.values);
            self.targets.append(&mut other.targets);

            // Check if the last element in `values` for self is smaller than (or equal to) the
            // first element in `values` for other, if that is the case we can skip sorting.
            match self.values[self_len - 1].cmp(&self.values[self_len]) {
                Ordering::Equal => panic!("duplicate switch target value"),
                Ordering::Less => {
                    // already sorted with no overlap
                }
                Ordering::Greater => {
                    // The values are not sorted, so we need to re-sort them
                    co_sort(&mut self.values, &mut self.targets);

                    // We now need to check if the elements are unique, otherwise we need to panic
                    if !self
                        .values
                        .array_windows::<2>()
                        .all(|[lhs, rhs]| lhs != rhs)
                    {
                        panic!("duplicate switch target value")
                    }
                }
            }
        }

        // add otherwise case again
        if let Some(otherwise) = otherwise {
            self.targets.push(otherwise);
        }
    }
}

/// A conditional branch terminator in the HashQL MIR.
///
/// Branch terminators provide conditional control flow by evaluating a boolean
/// test operand and transferring control to one of two target basic blocks
/// based on the result. This is the fundamental building block for implementing
/// conditional statements, loops, and other control flow constructs.
///
/// # Control Flow Semantics
///
/// When executed, a branch terminator:
/// 1. Evaluates the test operand to obtain a boolean value
/// 2. If the result is `true`, transfers control to the `then` target
/// 3. If the result is `false`, transfers control to the `else` target
/// 4. Passes any specified arguments to the chosen target block
///
/// # Usage Patterns
///
/// Branch terminators are commonly used to implement:
/// - `if` statements and conditional expressions
/// - Loop conditions and early exits
/// - Pattern matching and guard clauses
/// - Boolean logic short-circuiting
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SwitchInt<'heap> {
    pub discriminant: Operand<'heap>,
    pub targets: SwitchTargets<'heap>,
    // /// The boolean test operand that determines which branch to take.
    // ///
    // /// This [`Operand`] is evaluated to obtain a boolean value. The result
    // /// determines whether control transfers to the `then` target (if `true`)
    // /// or the `else` target (if `false`). The operand may reference a boolean
    // /// variable, constant, or the result of a boolean expression.
    // pub test: Operand<'heap>,

    // /// The target destination when the test evaluates to `true`.
    // ///
    // /// This [`Target`] specifies the basic block to transfer control to when
    // /// the test condition is satisfied. It includes both the destination block
    // /// and any arguments to pass to that block's parameters.
    // pub then: Target<'heap>,

    // /// The target destination when the test evaluates to `false`.
    // ///
    // /// This [`Target`] specifies the basic block to transfer control to when
    // /// the test condition is not satisfied. It includes both the destination
    // /// block and any arguments to pass to that block's parameters.
    // pub r#else: Target<'heap>,
}
