//! Switch terminator representation for HashQL MIR.
//!
//! Switch terminators represent multi-way control flow operations that evaluate an integer
//! discriminant and transfer control to one of multiple possible target basic blocks based on the
//! value.

use core::{cmp::Ordering, iter, mem};

use hashql_core::{algorithms::co_sort, heap};

use super::Target;
use crate::body::operand::Operand;

/// A binary switch target pair for if-else control flow.
///
/// Represents the two possible targets for a switch with discriminant values 0 (false)
/// and 1 (true).
///
/// Obtain this representation via [`SwitchTargets::as_if`].
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct SwitchIf<'heap> {
    /// The target to jump to when the discriminant is 1 (true).
    pub then: Target<'heap>,

    /// The target to jump to when the discriminant is 0 (false).
    pub r#else: Target<'heap>,
}

/// Represents which branch of a [`SwitchInt`] terminator is being taken.
///
/// Used by dataflow analyses to apply edge-specific effects when propagating
/// state through switch branches. See
/// [`apply_switch_int_edge_effect`](crate::pass::analysis::dataflow::framework::DataflowAnalysis::apply_switch_int_edge_effect).
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SwitchIntValue {
    /// An explicit case with the given discriminant value.
    Direct(u128),

    /// The default/otherwise branch for unmatched values.
    Otherwise,
}

/// A mapping from integer discriminant values to control flow targets.
///
/// Maps integer discriminant values to [`Target`]s for multi-way control flow.
/// Each discriminant value corresponds to exactly one target. An optional "otherwise"
/// target handles values without explicit mappings. If no otherwise target exists,
/// branching on an unmapped value is undefined behavior.
///
/// Values are guaranteed to be unique and maintained in sorted order.
///
/// # Examples
///
/// Creating a simple three-way switch with an otherwise case:
///
/// ```
/// use hashql_core::heap::Heap;
/// use hashql_mir::{
///     body::{
///         basic_block::BasicBlockId,
///         terminator::{SwitchTargets, Target},
///     },
///     intern::Interner,
/// };
///
/// let heap = Heap::new();
/// let interner = Interner::new(&heap);
///
/// let bb0 = BasicBlockId::new(0);
/// let bb1 = BasicBlockId::new(1);
/// let bb2 = BasicBlockId::new(2);
/// let otherwise = BasicBlockId::new(3);
///
/// let targets = SwitchTargets::new(
///     &heap,
///     [
///         (0, Target::block(bb0)),
///         (1, Target::block(bb1)),
///         (2, Target::block(bb2)),
///     ],
///     Some(Target::block(otherwise)),
/// );
///
/// // Values are automatically sorted
/// assert_eq!(targets.values(), &[0, 1, 2]);
/// assert_eq!(targets.target(1), Some(Target::block(bb1)));
/// assert_eq!(targets.target(99), Some(Target::block(otherwise)));
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SwitchTargets<'heap> {
    // TODO: in the future we might want to use `SmallVec<_, 2>` here as that is the common case
    /// Sorted list of discriminant values that map to specific targets.
    values: heap::Vec<'heap, u128>,

    /// Targets corresponding to each value in `values`, plus optional otherwise target.
    ///
    /// If `targets.len() == values.len() + 1`, the last target is the "otherwise" case.
    targets: heap::Vec<'heap, Target<'heap>>,
}

impl<'heap> SwitchTargets<'heap> {
    /// Creates a new switch target mapping from value-target pairs.
    ///
    /// Takes an iterator of `(value, target)` pairs and an optional otherwise target.
    /// Values are automatically sorted.
    ///
    /// # Panics
    ///
    /// Panics if duplicate values are present.
    ///
    /// # Examples
    ///
    /// Creating a switch with three explicit cases and an otherwise:
    ///
    /// ```
    /// use hashql_core::heap::Heap;
    /// use hashql_mir::{
    ///     body::{
    ///         basic_block::BasicBlockId,
    ///         terminator::{SwitchTargets, Target},
    ///     },
    ///     intern::Interner,
    /// };
    ///
    /// let heap = Heap::new();
    /// let interner = Interner::new(&heap);
    ///
    /// let targets = SwitchTargets::new(
    ///     &heap,
    ///     [
    ///         (10, Target::block(BasicBlockId::new(0))),
    ///         (20, Target::block(BasicBlockId::new(1))),
    ///         (30, Target::block(BasicBlockId::new(2))),
    ///     ],
    ///     Some(Target::block(BasicBlockId::new(3))),
    /// );
    ///
    /// assert_eq!(targets.values(), &[10, 20, 30]);
    /// assert_eq!(targets.target(10).unwrap().block, BasicBlockId::new(0));
    /// assert_eq!(targets.target(99).unwrap().block, BasicBlockId::new(3)); // otherwise
    /// ```
    ///
    /// Creating a switch without an otherwise target:
    ///
    /// ```
    /// use hashql_core::heap::Heap;
    /// use hashql_mir::{
    ///     body::{
    ///         basic_block::BasicBlockId,
    ///         terminator::{SwitchTargets, Target},
    ///     },
    ///     intern::Interner,
    /// };
    ///
    /// let heap = Heap::new();
    /// let interner = Interner::new(&heap);
    ///
    /// let targets = SwitchTargets::new(&heap, [(0, Target::block(BasicBlockId::new(0)))], None);
    ///
    /// assert_eq!(targets.otherwise(), None);
    /// assert_eq!(targets.target(99), None); // No otherwise, so None for unmatched values
    /// ```
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

        assert!(
            values.array_windows::<2>().all(|[lhs, rhs]| lhs != rhs),
            "duplicate values in switch targets"
        );

        Self { values, targets }
    }

    /// Creates a binary if-else switch from two targets.
    ///
    /// Creates a boolean branch where:
    /// - Value 0 (false) maps to the `else` target
    /// - Value 1 (true) maps to the `then` target
    ///
    /// Convenience constructor for if-else control flow.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::heap::Heap;
    /// use hashql_mir::{
    ///     body::{
    ///         basic_block::BasicBlockId,
    ///         terminator::{SwitchTargets, Target},
    ///     },
    ///     intern::Interner,
    /// };
    ///
    /// let heap = Heap::new();
    /// let interner = Interner::new(&heap);
    ///
    /// let then_block = Target::block(BasicBlockId::new(1));
    /// let else_block = Target::block(BasicBlockId::new(2));
    ///
    /// let targets = SwitchTargets::new_if(&heap, then_block, else_block);
    ///
    /// // Value 0 goes to else, value 1 goes to then
    /// assert_eq!(targets.target(0), Some(else_block));
    /// assert_eq!(targets.target(1), Some(then_block));
    ///
    /// // Can be converted back to SwitchIf
    /// let switch_if = targets.as_if().unwrap();
    /// assert_eq!(switch_if.then, then_block);
    /// assert_eq!(switch_if.r#else, else_block);
    /// ```
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

    /// Converts this switch to a binary if-else representation if possible.
    ///
    /// Returns [`Some`] if this switch has exactly two targets for values 0 and 1.
    /// Returns [`None`] otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::heap::Heap;
    /// use hashql_mir::{
    ///     body::{
    ///         basic_block::BasicBlockId,
    ///         terminator::{SwitchTargets, Target},
    ///     },
    ///     intern::Interner,
    /// };
    ///
    /// let heap = Heap::new();
    /// let interner = Interner::new(&heap);
    ///
    /// let then_block = Target::block(BasicBlockId::new(1));
    /// let else_block = Target::block(BasicBlockId::new(2));
    ///
    /// // Binary switch can be converted
    /// let binary = SwitchTargets::new_if(&heap, then_block, else_block);
    /// assert!(binary.as_if().is_some());
    ///
    /// // Multi-way switch cannot
    /// let multi = SwitchTargets::new(
    ///     &heap,
    ///     [(0, then_block), (1, else_block), (2, then_block)],
    ///     None,
    /// );
    /// assert!(multi.as_if().is_none());
    /// ```
    #[must_use]
    pub fn as_if(&self) -> Option<SwitchIf<'heap>> {
        if let [0, 1] = self.values[..]
            && let [r#else, then] = self.targets[..]
        {
            return Some(SwitchIf { then, r#else });
        }

        None
    }

    /// Returns `true` if this switch has an otherwise (default) target.
    ///
    /// The otherwise target handles discriminant values that don't match any
    /// explicit value in the switch.
    #[must_use]
    pub const fn has_otherwise(&self) -> bool {
        self.targets.len() > self.values.len()
    }

    /// Returns the otherwise (default) target, if present.
    ///
    /// The otherwise target is taken when the discriminant doesn't match any
    /// explicit value in the switch.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::heap::Heap;
    /// use hashql_mir::{
    ///     body::{
    ///         basic_block::BasicBlockId,
    ///         terminator::{SwitchTargets, Target},
    ///     },
    ///     intern::Interner,
    /// };
    ///
    /// let heap = Heap::new();
    /// let interner = Interner::new(&heap);
    ///
    /// let default = Target::block(BasicBlockId::new(99));
    ///
    /// let with_otherwise = SwitchTargets::new(
    ///     &heap,
    ///     [(1, Target::block(BasicBlockId::new(0)))],
    ///     Some(default),
    /// );
    /// assert_eq!(with_otherwise.otherwise(), Some(default));
    ///
    /// let without_otherwise = SwitchTargets::new(&heap, [], None);
    /// assert_eq!(without_otherwise.otherwise(), None);
    /// ```
    #[must_use]
    pub fn otherwise(&self) -> Option<Target<'heap>> {
        self.targets.get(self.values.len()).copied()
    }

    /// Looks up the target for a given discriminant value.
    ///
    /// Returns the corresponding [`Target`] if the value has an explicit mapping,
    /// otherwise returns the otherwise target if present, or [`None`] if neither exists.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::heap::Heap;
    /// use hashql_mir::{
    ///     body::{
    ///         basic_block::BasicBlockId,
    ///         terminator::{SwitchTargets, Target},
    ///     },
    ///     intern::Interner,
    /// };
    ///
    /// let heap = Heap::new();
    /// let interner = Interner::new(&heap);
    ///
    /// let bb0 = Target::block(BasicBlockId::new(0));
    /// let bb1 = Target::block(BasicBlockId::new(1));
    /// let otherwise = Target::block(BasicBlockId::new(99));
    ///
    /// let targets = SwitchTargets::new(&heap, [(10, bb0), (20, bb1)], Some(otherwise));
    ///
    /// assert_eq!(targets.target(10), Some(bb0));
    /// assert_eq!(targets.target(20), Some(bb1));
    /// assert_eq!(targets.target(999), Some(otherwise)); // Falls through to otherwise
    /// ```
    #[must_use]
    pub fn target(&self, value: u128) -> Option<Target<'heap>> {
        self.values
            .binary_search(&value)
            .ok()
            .map(|i| self.targets[i])
            .or_else(|| self.otherwise())
    }

    /// Returns a slice of all targets, including the otherwise target if present.
    ///
    /// The slice contains all targets in the same order as the values, with the
    /// otherwise target (if any) as the last element.
    #[must_use]
    pub fn targets(&self) -> &[Target<'heap>] {
        &self.targets
    }

    /// Returns a mutable slice of all targets, including the otherwise target if present.
    ///
    /// The slice contains all targets in the same order as the values, with the
    /// otherwise target (if any) as the last element.
    pub fn targets_mut(&mut self) -> &mut [Target<'heap>] {
        &mut self.targets
    }

    /// Returns a slice of all discriminant values in sorted order.
    ///
    /// The values are guaranteed to be sorted in ascending order and to be unique.
    #[must_use]
    pub fn values(&self) -> &[u128] {
        &self.values
    }

    /// Increments all discriminant values by the given amount.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::heap::Heap;
    /// use hashql_mir::{
    ///     body::{
    ///         basic_block::BasicBlockId,
    ///         terminator::{SwitchTargets, Target},
    ///     },
    ///     intern::Interner,
    /// };
    ///
    /// let heap = Heap::new();
    /// let interner = Interner::new(&heap);
    ///
    /// let mut targets = SwitchTargets::new(
    ///     &heap,
    ///     [
    ///         (1, Target::block(BasicBlockId::new(0))),
    ///         (2, Target::block(BasicBlockId::new(1))),
    ///     ],
    ///     None,
    /// );
    ///
    /// targets.increment_values(10);
    /// assert_eq!(targets.values(), &[11, 12]);
    /// ```
    // We do not expose a `values_mut` method because transformations could violate the ordering
    // guarantees.
    pub fn increment_values(&mut self, increment: u128) {
        for value in &mut self.values {
            *value += increment;
        }
    }

    /// Returns an iterator over `(value, target)` pairs.
    ///
    /// Yields each discriminant value and its corresponding target. The otherwise target is not
    /// included in this iterator.
    ///
    /// The iterator is sorted in ascending order and does not contain duplicate values for `value`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::heap::Heap;
    /// use hashql_mir::{
    ///     body::{
    ///         basic_block::BasicBlockId,
    ///         terminator::{SwitchTargets, Target},
    ///     },
    ///     intern::Interner,
    /// };
    ///
    /// let heap = Heap::new();
    /// let interner = Interner::new(&heap);
    ///
    /// let targets = SwitchTargets::new(
    ///     &heap,
    ///     [
    ///         (10, Target::block(BasicBlockId::new(0))),
    ///         (20, Target::block(BasicBlockId::new(1))),
    ///     ],
    ///     Some(Target::block(BasicBlockId::new(99))),
    /// );
    ///
    /// let pairs: Vec<_> = targets.iter().collect();
    /// assert_eq!(pairs.len(), 2);
    /// assert_eq!(pairs[0].0, 10);
    /// assert_eq!(pairs[1].0, 20);
    /// ```
    #[must_use]
    pub fn iter(
        &self,
    ) -> impl DoubleEndedIterator<Item = (u128, Target<'heap>)> + ExactSizeIterator {
        iter::zip(&self.values, &self.targets).map(|(&value, &target)| (value, target))
    }

    /// Removes a target by its discriminant value.
    ///
    /// Searches for the given `value` and removes both the value and its
    /// corresponding target. Returns the removed [`Target`], or [`None`] if
    /// the value was not found.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::heap::Heap;
    /// use hashql_mir::{
    ///     body::{
    ///         basic_block::BasicBlockId,
    ///         terminator::{SwitchTargets, Target},
    ///     },
    ///     intern::Interner,
    /// };
    ///
    /// let heap = Heap::new();
    /// let interner = Interner::new(&heap);
    ///
    /// let mut targets = SwitchTargets::new(
    ///     &heap,
    ///     [
    ///         (10, Target::block(BasicBlockId::new(0))),
    ///         (20, Target::block(BasicBlockId::new(1))),
    ///     ],
    ///     None,
    /// );
    ///
    /// let removed = targets.remove_target(10);
    /// assert!(removed.is_some());
    /// assert_eq!(targets.values(), &[20]);
    ///
    /// assert!(targets.remove_target(99).is_none()); // Not found
    /// ```
    pub fn remove_target(&mut self, value: u128) -> Option<Target<'heap>> {
        let index = self.values.binary_search(&value).ok()?;

        self.values.remove(index);
        let target = self.targets.remove(index);

        Some(target)
    }

    /// Adds a new target for a specific discriminant value.
    ///
    /// # Panics
    ///
    /// Panics if the `value` already exists in the switch.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::heap::Heap;
    /// use hashql_mir::{
    ///     body::{
    ///         basic_block::BasicBlockId,
    ///         terminator::{SwitchTargets, Target},
    ///     },
    ///     intern::Interner,
    /// };
    ///
    /// let heap = Heap::new();
    /// let interner = Interner::new(&heap);
    ///
    /// let mut targets = SwitchTargets::new(&heap, [], None);
    ///
    /// targets.add_target(10, Target::block(BasicBlockId::new(0)));
    /// targets.add_target(5, Target::block(BasicBlockId::new(1)));
    ///
    /// // Values are kept sorted
    /// assert_eq!(targets.values(), &[5, 10]);
    /// ```
    pub fn add_target(&mut self, value: u128, target: Target<'heap>) {
        let index = self
            .values
            .binary_search(&value)
            .expect_err("duplicate switch target value");

        self.values.insert(index, value);
        self.targets.insert(index, target);
    }

    /// Merges another switch's targets into this one.
    ///
    /// Appends all value-target pairs from `other` into `self`, maintaining
    /// sorted order. If both switches have an otherwise target, this method panics.
    /// After the operation, `other` will be empty.
    ///
    /// # Panics
    ///
    /// - Panics if both `self` and `other` have an otherwise target
    /// - Panics if any value appears in both switches (duplicate values)
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::heap::Heap;
    /// use hashql_mir::{
    ///     body::{
    ///         basic_block::BasicBlockId,
    ///         terminator::{SwitchTargets, Target},
    ///     },
    ///     intern::Interner,
    /// };
    ///
    /// let heap = Heap::new();
    /// let interner = Interner::new(&heap);
    ///
    /// let mut first = SwitchTargets::new(&heap, [(10, Target::block(BasicBlockId::new(0)))], None);
    ///
    /// let mut second = SwitchTargets::new(
    ///     &heap,
    ///     [(20, Target::block(BasicBlockId::new(1)))],
    ///     Some(Target::block(BasicBlockId::new(99))),
    /// );
    ///
    /// first.append(&mut second);
    ///
    /// assert_eq!(first.values(), &[10, 20]);
    /// assert_eq!(first.otherwise().unwrap().block, BasicBlockId::new(99));
    /// assert!(second.values().is_empty());
    /// ```
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
                    assert!(
                        self.values
                            .array_windows::<2>()
                            .all(|&[lhs, rhs]| lhs != rhs),
                        "duplicate values in switch targets"
                    );
                }
            }
        }

        // add otherwise case again
        if let Some(otherwise) = otherwise {
            self.targets.push(otherwise);
        }
    }
}

/// A multi-way switch terminator in the HashQL MIR.
///
/// Evaluates an integer discriminant and transfers control to one of multiple target
/// basic blocks based on the value. Used to implement `match` expressions, `switch`
/// statements, and integer-based conditional logic.
///
/// # Control Flow Semantics
///
/// When executed:
/// 1. Evaluates the discriminant [`Operand`] to obtain an integer value
/// 2. Looks up the value in the [`SwitchTargets`] mapping
/// 3. Transfers control to the matching target, or to the otherwise target if no match exists
/// 4. Passes any specified arguments to the target block
///
/// # Usage Patterns
///
/// Switch terminators are commonly used to implement:
/// - `match` expressions on integer types and enums
/// - `switch` statements from C-style languages
/// - Boolean branches (as a special case with values 0 and 1)
/// - Dispatch tables and jump tables
///
/// # Examples
///
/// Creating a simple three-way switch:
///
/// ```
/// use hashql_core::{heap::Heap, value::Primitive};
/// use hashql_mir::{
///     body::{
///         basic_block::BasicBlockId,
///         constant::Constant,
///         operand::Operand,
///         terminator::{SwitchInt, SwitchTargets, Target},
///     },
///     intern::Interner,
/// };
///
/// let heap = Heap::new();
/// let interner = Interner::new(&heap);
///
/// // Create targets for each case
/// let targets = SwitchTargets::new(
///     &heap,
///     [
///         (0, Target::block(BasicBlockId::new(0))),
///         (1, Target::block(BasicBlockId::new(1))),
///         (2, Target::block(BasicBlockId::new(2))),
///     ],
///     Some(Target::block(BasicBlockId::new(3))), // otherwise
/// );
///
/// // Create the switch with an integer discriminant
/// let switch = SwitchInt {
///     discriminant: Operand::Constant(Constant::Int(true.into())),
///     targets,
/// };
/// ```
///
/// Creating a boolean if-else branch:
///
/// ```
/// use hashql_core::heap::Heap;
/// use hashql_mir::{
///     body::{
///         basic_block::BasicBlockId,
///         local::Local,
///         operand::Operand,
///         place::Place,
///         terminator::{SwitchInt, SwitchTargets, Target},
///     },
///     intern::Interner,
/// };
///
/// let heap = Heap::new();
/// let interner = Interner::new(&heap);
///
/// let then_target = Target::block(BasicBlockId::new(1));
/// let else_target = Target::block(BasicBlockId::new(2));
///
/// // Create a binary switch for if-else
/// let switch = SwitchInt {
///     discriminant: Operand::Place(Place::local(Local::new(0))),
///     targets: SwitchTargets::new_if(&heap, then_target, else_target),
/// };
///
/// // Can check if it's a simple if-else
/// assert!(switch.targets.as_if().is_some());
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SwitchInt<'heap> {
    /// The integer value that determines which target to jump to.
    ///
    /// Evaluated to obtain an integer value, which is then matched against the
    /// values in [`targets`](Self::targets) to determine the control flow destination.
    pub discriminant: Operand<'heap>,

    /// The mapping from integer values to control flow targets.
    ///
    /// Contains all possible branches for this switch, including an optional
    /// otherwise (default) case for unmatched values.
    pub targets: SwitchTargets<'heap>,
}
