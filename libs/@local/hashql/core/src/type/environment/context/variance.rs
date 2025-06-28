use alloc::rc::{Rc, Weak};
use core::cell::Cell;

/// Lookup table for variance transitions.
///
/// This table encodes how two variance values combine to produce a new variance.
/// The index is calculated as `current_variance.into_index() * 3 + local_variance.into_index()`,
/// where variances are mapped to indices: Contravariant=0, Invariant=1, Covariant=2.
const NEXT: [Variance; 9] = {
    const COV: Variance = Variance::Covariant;
    const CON: Variance = Variance::Contravariant;
    const INV: Variance = Variance::Invariant;

    [
        //-    0    +
        COV, INV, CON, // - (cur)
        INV, INV, INV, // 0 (cur)
        CON, INV, COV, // + (cur)
    ]
};

/// Lookup table for variance flow direction.
///
/// This table encodes whether a variance transition represents a "forward" flow,
/// "reverse" flow, or invariant flow. Uses the same indexing scheme as [`NEXT`].
const FLOW: [VarianceFlow; 9] = {
    const FWD: VarianceFlow = VarianceFlow::Forward;
    const REV: VarianceFlow = VarianceFlow::Reverse;
    const INV: VarianceFlow = VarianceFlow::Invariant;

    [
        //-    0    +
        REV, INV, FWD, // - (cur)
        INV, INV, INV, // 0 (cur)
        REV, INV, FWD, // + (cur)
    ]
};

/// Tracks the current variance in a type-checking context.
///
/// Provides stack-like behavior for managing variance transitions during type analysis.
/// Each transition returns a guard that automatically restores the previous variance
/// when dropped.
#[derive(Debug)]
pub struct VarianceState(Rc<Cell<Variance>>);

impl VarianceState {
    /// Creates a new variance state with the specified initial variance.
    #[must_use]
    pub fn new(variance: Variance) -> Self {
        Self(Rc::new(Cell::new(variance)))
    }

    /// Returns the current variance value.
    #[must_use]
    pub fn get(&self) -> Variance {
        self.0.get()
    }

    /// Transitions to a new variance state.
    ///
    /// Computes the composition of the current variance with `local` and updates
    /// the internal state. Returns a guard that restores the previous variance
    /// when dropped, along with the flow direction of this transition.
    pub fn transition(&self, local: Variance) -> (VarianceGuard, VarianceFlow) {
        let current = self.get();

        let next = NEXT[current.into_index() * 3 + local.into_index()];
        let flow = FLOW[current.into_index() * 3 + local.into_index()];

        // replace is const, set isn't
        let _: Variance = self.0.replace(next);

        (
            VarianceGuard {
                state: Rc::downgrade(&self.0),
                previous: Some(current),
            },
            flow,
        )
    }
}

/// RAII guard that restores the previous variance state when dropped.
///
/// Returned by [`VarianceState::transition`] to ensure variance transitions are
/// properly unwound. Guards can be nested, with each restoring its respective
/// previous state.
#[must_use = "This will restore the previous value once dropped"]
#[derive(Debug)]
pub struct VarianceGuard {
    state: Weak<Cell<Variance>>,
    previous: Option<Variance>,
}

impl Drop for VarianceGuard {
    fn drop(&mut self) {
        // The take makes sure that we only ever restore the previous value once
        if let Some(previous) = self.previous.take()
            && let Some(value) = self.state.upgrade()
        {
            value.set(previous);
        }
    }
}

/// Represents the directional flow of a variance transition.
///
/// Indicates whether a variance transition preserves the direction of type
/// relationships, reverses it, or makes it invariant.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum VarianceFlow {
    /// The variance transition preserves the direction of type relationships.
    Forward,

    /// The variance transition flips the direction of type relationships.
    Reverse,

    /// The variance transition results in no meaningful direction.
    Invariant,
}

/// Represents the type relationship variance used in generic type checking.
///
/// Variance defines how subtyping relationships between generic parameter types
/// affect subtyping relationships between the resulting parameterized types.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Variance {
    /// Covariance preserves the ordering of types.
    ///
    /// If `A <: B` (A is a subtype of B), then `I<A> <: I<B>` for a covariant
    /// type constructor `I`.
    ///
    /// Example: If `Cat <: Animal`, then `List<Cat> <: List<Animal>`.
    Covariant = 1,

    /// Contravariance reverses the ordering of types.
    ///
    /// If `A <: B` (A is a subtype of B), then `I<B> <: I<A>` for a contravariant
    /// type constructor `I`.
    ///
    /// Example: If `Cat <: Animal`, then `fn(Animal) <: fn(Cat)` for parameter types.
    Contravariant = -1,

    /// Invariance requires exact match of types.
    ///
    /// For an invariant type constructor `I`, `I<A> <: I<B>` if and only if `A = B`.
    ///
    /// Example: `Dict<Integer, String>` and `Dict<Number, String>` are not subtypes
    /// of each other, even though `Integer <: Number`.
    Invariant = 0,
}

impl Variance {
    /// Converts the variance to a zero-based array index.
    #[expect(
        clippy::cast_sign_loss,
        reason = "we ensure that the value is non-negative"
    )]
    const fn into_index(self) -> usize {
        let value = (self as i8) + 1;
        debug_assert!(value >= 0);

        value as usize
    }
}

#[cfg(test)]
mod tests {
    use rstest::rstest;

    use super::{Variance, VarianceFlow, VarianceState};

    #[rstest]
    // Covariance
    #[case(
        Variance::Covariant,
        Variance::Covariant,
        Variance::Covariant,
        VarianceFlow::Forward
    )]
    #[case(
        Variance::Covariant,
        Variance::Contravariant,
        Variance::Contravariant,
        VarianceFlow::Reverse
    )]
    #[case(
        Variance::Covariant,
        Variance::Invariant,
        Variance::Invariant,
        VarianceFlow::Invariant
    )]
    // Contravariance
    #[case(
        Variance::Contravariant,
        Variance::Covariant,
        Variance::Contravariant,
        VarianceFlow::Forward
    )]
    #[case(
        Variance::Contravariant,
        Variance::Contravariant,
        Variance::Covariant,
        VarianceFlow::Reverse
    )]
    #[case(
        Variance::Contravariant,
        Variance::Invariant,
        Variance::Invariant,
        VarianceFlow::Invariant
    )]
    // Invariance
    #[case(
        Variance::Invariant,
        Variance::Covariant,
        Variance::Invariant,
        VarianceFlow::Invariant
    )]
    #[case(
        Variance::Invariant,
        Variance::Contravariant,
        Variance::Invariant,
        VarianceFlow::Invariant
    )]
    #[case(
        Variance::Invariant,
        Variance::Invariant,
        Variance::Invariant,
        VarianceFlow::Invariant
    )]
    fn transition(
        #[case] from: Variance,
        #[case] to: Variance,
        #[case] into: Variance,
        #[case] flow: VarianceFlow,
    ) {
        let state = VarianceState::new(from);
        assert_eq!(state.get(), from);

        let (guard, actual_flow) = state.transition(to);
        assert_eq!(actual_flow, flow);
        assert_eq!(state.get(), into);

        drop(guard);

        assert_eq!(state.get(), from);
    }

    #[test]
    fn nested_guards_restore_properly() {
        let state = VarianceState::new(Variance::Covariant);

        let (guard1, _) = state.transition(Variance::Contravariant); // now contra
        let (guard2, _) = state.transition(Variance::Covariant); // still contra
        assert_eq!(state.get(), Variance::Contravariant);

        drop(guard2); // back to contra
        assert_eq!(state.get(), Variance::Contravariant);

        drop(guard1); // back to co
        assert_eq!(state.get(), Variance::Covariant);
    }
}
