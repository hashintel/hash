//! Algebraic structures for dataflow analysis.
//!
//! This module provides composable traits for semirings and lattices,
//! where the algebraic structure is separate from the carrier type it operates on.
//! This allows the same underlying type to have multiple algebraic interpretations.
//!
//! # Design
//!
//! The traits are parameterized over a carrier type `T`, allowing a single type to have
//! multiple algebraic structures. For example, `u32` can be used with both a tropical
//! min-plus semiring and a standard arithmetic semiring.
//!
//! ```ignore
//! struct TropicalMinPlus;
//! struct RegularArithmetic;
//!
//! impl Semiring<u32> for TropicalMinPlus { /* min-plus operations */ }
//! impl Semiring<u32> for RegularArithmetic { /* standard +/* operations */ }
//! ```
//!
//! # Trait Hierarchy
//!
//! ## Semiring traits
//!
//! - [`AdditiveMonoid`] - Provides `zero` and `plus` operations
//! - [`MultiplicativeMonoid`] - Provides `one` and `times` operations
//! - [`Semiring`] - Combines both monoids with distributivity
//!
//! ## Lattice traits
//!
//! - [`JoinSemiLattice`] - Provides `join` (least upper bound)
//! - [`MeetSemiLattice`] - Provides `meet` (greatest lower bound)
//! - [`Lattice`] - Combines both with absorption laws
//!
//! ## Bounded traits
//!
//! - [`HasBottom`] - Provides a `bottom` (least) element
//! - [`HasTop`] - Provides a `top` (greatest) element
//! - [`BoundedJoinSemiLattice`] - Join-semilattice with bottom
//! - [`BoundedMeetSemiLattice`] - Meet-semilattice with top
//! - [`BoundedLattice`] - Full lattice with both bounds
//!
//! # Testing
//!
//! The [`laws`] module provides assertion functions for verifying algebraic properties.
//! Each trait documents which assertion function should be used.

#[cfg(test)]
pub(crate) mod laws;

/// Additive monoid structure over a carrier type.
///
/// Provides the additive identity ([`zero`]) and associative addition operation ([`plus`]).
///
/// # Laws
///
/// For all `a`, `b`, `c` in `T`:
/// - Identity: `plus(zero(), a) = plus(a, zero()) = a`
/// - Associativity: `plus(plus(a, b), c) = plus(a, plus(b, c))`
/// - Commutativity (for semirings): `plus(a, b) = plus(b, a)`
///
/// # Implementation
///
/// Use [`laws::assert_additive_monoid`] to verify these laws in tests.
///
/// [`zero`]: AdditiveMonoid::zero
/// [`plus`]: AdditiveMonoid::plus
pub trait AdditiveMonoid<T> {
    /// Returns the additive identity element.
    ///
    /// For any element `a`: `plus(zero(), a) = plus(a, zero()) = a`
    fn zero(&self) -> T;

    /// Combines two elements using the additive operation.
    ///
    /// Returns `true` if `lhs` was changed.
    fn plus(&self, lhs: &mut T, rhs: &T) -> bool;

    fn plus_owned(&self, mut lhs: T, rhs: &T) -> T
    where
        T: Sized,
    {
        self.plus(&mut lhs, rhs);
        lhs
    }
}

/// Multiplicative monoid structure over a carrier type.
///
/// Provides the multiplicative identity ([`one`]) and associative multiplication
/// operation ([`times`]).
///
/// # Laws
///
/// For all `a`, `b`, `c` in `T`:
/// - Identity: `times(one(), a) = times(a, one()) = a`
/// - Associativity: `times(times(a, b), c) = times(a, times(b, c))`
///
/// # Implementation
///
/// Use [`laws::assert_multiplicative_monoid`] to verify these laws in tests.
///
/// [`one`]: MultiplicativeMonoid::one
/// [`times`]: MultiplicativeMonoid::times
pub trait MultiplicativeMonoid<T> {
    /// Returns the multiplicative identity element.
    ///
    /// For any element `a`: `times(one(), a) = times(a, one()) = a`
    fn one(&self) -> T;

    /// Combines two elements using the multiplicative operation.
    ///
    /// Returns `true` if `lhs` was changed.
    fn times(&self, lhs: &mut T, rhs: &T) -> bool;

    fn times_owned(&self, mut lhs: T, rhs: &T) -> T
    where
        T: Sized,
    {
        self.times(&mut lhs, rhs);
        lhs
    }
}

/// A semiring structure over a carrier type.
///
/// A semiring combines an [`AdditiveMonoid`] (commutative) and a [`MultiplicativeMonoid`],
/// where multiplication distributes over addition and zero annihilates.
///
/// # Laws
///
/// In addition to the monoid laws:
/// - Left distributivity: `times(a, plus(b, c)) = plus(times(a, b), times(a, c))`
/// - Right distributivity: `times(plus(a, b), c) = plus(times(a, c), times(b, c))`
/// - Zero annihilates: `times(zero(), a) = times(a, zero()) = zero()`
///
/// # Implementation
///
/// Use [`laws::assert_semiring`] to verify these laws in tests.
pub trait Semiring<T>: AdditiveMonoid<T> + MultiplicativeMonoid<T> {}

// Blanket implementation: any type implementing both monoids is a semiring
impl<S, T> Semiring<T> for S where S: AdditiveMonoid<T> + MultiplicativeMonoid<T> {}

/// Join-semilattice structure over a carrier type.
///
/// Provides a binary [`join`] operation (least upper bound / supremum).
///
/// # Laws
///
/// For all `a`, `b`, `c` in `T`:
/// - Idempotency: `join(a, a) = a`
/// - Commutativity: `join(a, b) = join(b, a)`
/// - Associativity: `join(join(a, b), c) = join(a, join(b, c))`
///
/// # Implementation
///
/// Use [`laws::assert_join_semilattice`] to verify these laws in tests.
///
/// [`join`]: JoinSemiLattice::join
pub trait JoinSemiLattice<T> {
    /// Computes the least upper bound (supremum) of two elements.
    fn join(&self, lhs: &mut T, rhs: &T) -> bool;
    fn join_owned(&self, mut lhs: T, rhs: &T) -> T
    where
        T: Sized,
    {
        self.join(&mut lhs, rhs);
        lhs
    }
}

/// Meet-semilattice structure over a carrier type.
///
/// Provides a binary [`meet`] operation (greatest lower bound / infimum).
///
/// # Laws
///
/// For all `a`, `b`, `c` in `T`:
/// - Idempotency: `meet(a, a) = a`
/// - Commutativity: `meet(a, b) = meet(b, a)`
/// - Associativity: `meet(meet(a, b), c) = meet(a, meet(b, c))`
///
/// # Implementation
///
/// Use [`laws::assert_meet_semilattice`] to verify these laws in tests.
///
/// [`meet`]: MeetSemiLattice::meet
pub trait MeetSemiLattice<T> {
    /// Computes the greatest lower bound (infimum) of two elements.
    fn meet(&self, lhs: &mut T, rhs: &T) -> bool;
    fn meet_owned(&self, mut lhs: T, rhs: &T) -> T
    where
        T: Sized,
    {
        self.meet(&mut lhs, rhs);
        lhs
    }
}

/// Full lattice structure over a carrier type.
///
/// A lattice has both [`join`] (least upper bound) and [`meet`] (greatest lower bound)
/// operations.
///
/// # Laws
///
/// In addition to the semilattice laws, absorption laws hold:
/// - `join(a, meet(a, b)) = a`
/// - `meet(a, join(a, b)) = a`
///
/// # Implementation
///
/// Use [`laws::assert_lattice`] to verify these laws in tests.
///
/// [`join`]: JoinSemiLattice::join
/// [`meet`]: MeetSemiLattice::meet
pub trait Lattice<T>: JoinSemiLattice<T> + MeetSemiLattice<T> {}

// Blanket implementation
impl<S, T> Lattice<T> for S where S: JoinSemiLattice<T> + MeetSemiLattice<T> {}

/// Provides a bottom element (minimum / least element) for a type.
///
/// # Laws
///
/// For all `a` in `T`:
/// - `join(bottom(), a) = a` (bottom is the identity for join)
/// - `meet(bottom(), a) = bottom()` (bottom is the annihilator for meet)
///
/// # Implementation
///
/// Use [`laws::assert_is_bottom_consistent`] to verify consistency in tests.
pub trait HasBottom<T> {
    /// Returns the bottom element (least element).
    fn bottom(&self) -> T;
    fn is_bottom(&self, value: &T) -> bool;
}

/// Provides a top element (maximum / greatest element) for a type.
///
/// # Laws
///
/// For all `a` in `T`:
/// - `meet(top(), a) = a` (top is the identity for meet)
/// - `join(top(), a) = top()` (top is the annihilator for join)
///
/// # Implementation
///
/// Use [`laws::assert_is_top_consistent`] to verify consistency in tests.
pub trait HasTop<T> {
    /// Returns the top element (greatest element).
    fn top(&self) -> T;
    fn is_top(&self, value: &T) -> bool;
}

/// Bounded join-semilattice with a bottom element.
///
/// This is the most common structure for forward dataflow analysis,
/// where bottom represents "no information" and join merges information
/// from different control flow paths.
///
/// # Implementation
///
/// Use [`laws::assert_bounded_join_semilattice`] to verify these laws in tests.
pub trait BoundedJoinSemiLattice<T>: JoinSemiLattice<T> + HasBottom<T> {}

// Blanket implementation
impl<S, T> BoundedJoinSemiLattice<T> for S where S: JoinSemiLattice<T> + HasBottom<T> {}

/// Bounded meet-semilattice with a top element.
///
/// Used in backward dataflow analysis where top represents
/// "all possible information" and meet computes common information.
///
/// # Implementation
///
/// Use [`laws::assert_bounded_meet_semilattice`] to verify these laws in tests.
pub trait BoundedMeetSemiLattice<T>: MeetSemiLattice<T> + HasTop<T> {}

// Blanket implementation
impl<S, T> BoundedMeetSemiLattice<T> for S where S: MeetSemiLattice<T> + HasTop<T> {}

/// Bounded lattice with both bottom and top elements.
///
/// # Implementation
///
/// Use [`laws::assert_bounded_lattice`] to verify these laws in tests.
pub trait BoundedLattice<T>: Lattice<T> + HasBottom<T> + HasTop<T> {}

// Blanket implementation
impl<S, T> BoundedLattice<T> for S where S: Lattice<T> + HasBottom<T> + HasTop<T> {}
