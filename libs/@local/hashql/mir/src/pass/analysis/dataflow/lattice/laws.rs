//! Testing utilities for verifying algebraic properties.
#![expect(clippy::min_ident_chars)]

use super::{
    AdditiveMonoid, BoundedJoinSemiLattice, BoundedLattice, BoundedMeetSemiLattice, HasBottom,
    HasTop, JoinSemiLattice, Lattice, MeetSemiLattice, MultiplicativeMonoid, Semiring,
};

// ========================================================================
// Additive Monoid Laws
// ========================================================================

/// Verifies left identity: `plus(zero(), a) = a`
fn additive_left_identity<S, T>(structure: &S, a: T) -> bool
where
    S: AdditiveMonoid<T>,
    T: Clone + PartialEq,
{
    let zero = structure.zero();
    let result = structure.plus_owned(zero, &a);
    result == a
}

/// Verifies right identity: `plus(a, zero()) = a`
fn additive_right_identity<S, T>(structure: &S, a: T) -> bool
where
    S: AdditiveMonoid<T>,
    T: Clone + PartialEq,
{
    let zero = structure.zero();
    let result = structure.plus_owned(a.clone(), &zero);
    result == a
}

/// Verifies associativity: `plus(plus(a, b), c) = plus(a, plus(b, c))`
fn additive_associativity<S, T>(structure: &S, a: T, b: T, c: T) -> bool
where
    S: AdditiveMonoid<T>,
    T: Clone + PartialEq,
{
    let left = structure.plus_owned(structure.plus_owned(a.clone(), &b), &c);
    let right = structure.plus_owned(a, &structure.plus_owned(b, &c));
    left == right
}

/// Verifies commutativity: `plus(a, b) = plus(b, a)`
fn additive_commutativity<S, T>(structure: &S, a: T, b: T) -> bool
where
    S: AdditiveMonoid<T>,
    T: Clone + PartialEq,
{
    let left = structure.plus_owned(a.clone(), &b);
    let right = structure.plus_owned(b, &a);
    left == right
}

#[track_caller]
pub(crate) fn assert_additive_monoid<S, T>(structure: &S, a: T, b: T, c: T)
where
    S: AdditiveMonoid<T>,
    T: Clone + PartialEq,
{
    assert!(additive_left_identity(structure, a.clone()));
    assert!(additive_right_identity(structure, a.clone()));
    assert!(additive_associativity(structure, a.clone(), b.clone(), c));
    assert!(additive_commutativity(structure, a, b));
}

// ========================================================================
// Multiplicative Monoid Laws
// ========================================================================

/// Verifies left identity: `times(one(), a) = a`
fn multiplicative_left_identity<S, T>(structure: &S, a: T) -> bool
where
    S: MultiplicativeMonoid<T>,
    T: Clone + PartialEq,
{
    let one = structure.one();
    let result = structure.times_owned(one, &a);
    result == a
}

/// Verifies right identity: `times(a, one()) = a`
fn multiplicative_right_identity<S, T>(structure: &S, a: T) -> bool
where
    S: MultiplicativeMonoid<T>,
    T: Clone + PartialEq,
{
    let one = structure.one();
    let result = structure.times_owned(a.clone(), &one);
    result == a
}

/// Verifies associativity: `times(times(a, b), c) = times(a, times(b, c))`
fn multiplicative_associativity<S, T>(structure: &S, a: T, b: T, c: T) -> bool
where
    S: MultiplicativeMonoid<T>,
    T: Clone + PartialEq,
{
    let left = structure.times_owned(structure.times_owned(a.clone(), &b), &c);
    let right = structure.times_owned(a, &structure.times_owned(b, &c));
    left == right
}

#[track_caller]
pub(crate) fn assert_multiplicative_monoid<S, T>(structure: &S, a: T, b: T, c: T)
where
    S: MultiplicativeMonoid<T>,
    T: Clone + PartialEq,
{
    assert!(multiplicative_left_identity(structure, a.clone()));
    assert!(multiplicative_right_identity(structure, a.clone()));
    assert!(multiplicative_associativity(structure, a, b, c));
}

// ========================================================================
// Semiring Laws
// ========================================================================

/// Verifies left distributivity: `times(a, plus(b, c)) = plus(times(a, b), times(a, c))`
fn left_distributivity<S, T>(structure: &S, a: T, b: T, c: T) -> bool
where
    S: Semiring<T>,
    T: Clone + PartialEq,
{
    let left = structure.times_owned(a.clone(), &structure.plus_owned(b.clone(), &c));
    let right = structure.plus_owned(
        structure.times_owned(a.clone(), &b),
        &structure.times_owned(a, &c),
    );
    left == right
}

/// Verifies right distributivity: `times(plus(a, b), c) = plus(times(a, c), times(b, c))`
fn right_distributivity<S, T>(structure: &S, a: T, b: T, c: T) -> bool
where
    S: Semiring<T>,
    T: Clone + PartialEq,
{
    let left = structure.times_owned(structure.plus_owned(a.clone(), &b), &c);
    let right = structure.plus_owned(structure.times_owned(a, &c), &structure.times_owned(b, &c));
    left == right
}

/// Verifies zero annihilation: `times(zero(), a) = zero()` and `times(a, zero()) = zero()`
fn zero_annihilates<S, T>(structure: &S, a: T) -> bool
where
    S: Semiring<T>,
    T: Clone + PartialEq,
{
    let zero = structure.zero();
    let left = structure.times_owned(zero.clone(), &a);
    let right = structure.times_owned(a, &zero);
    left == zero && right == zero
}

#[track_caller]
pub(crate) fn assert_semiring<S, T>(structure: &S, a: T, b: T, c: T)
where
    S: Semiring<T>,
    T: Clone + PartialEq,
{
    assert_additive_monoid(structure, a.clone(), b.clone(), c.clone());
    assert_multiplicative_monoid(structure, a.clone(), b.clone(), c.clone());
    assert!(left_distributivity(
        structure,
        a.clone(),
        b.clone(),
        c.clone()
    ));
    assert!(right_distributivity(structure, a.clone(), b, c));
    assert!(zero_annihilates(structure, a));
}

// ========================================================================
// Join-Semilattice Laws
// ========================================================================

/// Verifies idempotency: `join(a, a) = a`
fn join_idempotency<S, T>(structure: &S, a: T) -> bool
where
    S: JoinSemiLattice<T>,
    T: Clone + PartialEq,
{
    let result = structure.join_owned(a.clone(), &a);
    result == a
}

/// Verifies commutativity: `join(a, b) = join(b, a)`
fn join_commutativity<S, T>(structure: &S, a: T, b: T) -> bool
where
    S: JoinSemiLattice<T>,
    T: Clone + PartialEq,
{
    let left = structure.join_owned(a.clone(), &b);
    let right = structure.join_owned(b, &a);
    left == right
}

/// Verifies associativity: `join(join(a, b), c) = join(a, join(b, c))`
fn join_associativity<S, T>(structure: &S, a: T, b: T, c: T) -> bool
where
    S: JoinSemiLattice<T>,
    T: Clone + PartialEq,
{
    let left = structure.join_owned(structure.join_owned(a.clone(), &b), &c);
    let right = structure.join_owned(a, &structure.join_owned(b, &c));
    left == right
}

#[track_caller]
pub(crate) fn assert_join_semilattice<S, T>(structure: &S, a: T, b: T, c: T)
where
    S: JoinSemiLattice<T>,
    T: Clone + PartialEq,
{
    assert!(join_idempotency(structure, a.clone()));
    assert!(join_commutativity(structure, a.clone(), b.clone()));
    assert!(join_associativity(structure, a, b, c));
}

// ========================================================================
// Meet-Semilattice Laws
// ========================================================================

/// Verifies idempotency: `meet(a, a) = a`
fn meet_idempotency<S, T>(structure: &S, a: T) -> bool
where
    S: MeetSemiLattice<T>,
    T: Clone + PartialEq,
{
    let result = structure.meet_owned(a.clone(), &a);
    result == a
}

/// Verifies commutativity: `meet(a, b) = meet(b, a)`
fn meet_commutativity<S, T>(structure: &S, a: T, b: T) -> bool
where
    S: MeetSemiLattice<T>,
    T: Clone + PartialEq,
{
    let left = structure.meet_owned(a.clone(), &b);
    let right = structure.meet_owned(b, &a);
    left == right
}

/// Verifies associativity: `meet(meet(a, b), c) = meet(a, meet(b, c))`
fn meet_associativity<S, T>(structure: &S, a: T, b: T, c: T) -> bool
where
    S: MeetSemiLattice<T>,
    T: Clone + PartialEq,
{
    let left = structure.meet_owned(structure.meet_owned(a.clone(), &b), &c);
    let right = structure.meet_owned(a, &structure.meet_owned(b, &c));
    left == right
}

#[track_caller]
pub(crate) fn assert_meet_semilattice<S, T>(structure: &S, a: T, b: T, c: T)
where
    S: MeetSemiLattice<T>,
    T: Clone + PartialEq,
{
    assert!(meet_idempotency(structure, a.clone()));
    assert!(meet_associativity(structure, a.clone(), b.clone(), c));
    assert!(meet_commutativity(structure, a, b));
}

// ========================================================================
// Lattice Absorption Laws
// ========================================================================

/// Verifies join absorption: `join(a, meet(a, b)) = a`
fn join_absorption<S, T>(structure: &S, a: T, b: T) -> bool
where
    S: Lattice<T>,
    T: Clone + PartialEq,
{
    let meet_ab = structure.meet_owned(a.clone(), &b);
    let result = structure.join_owned(a.clone(), &meet_ab);
    result == a
}

/// Verifies meet absorption: `meet(a, join(a, b)) = a`
fn meet_absorption<S, T>(structure: &S, a: T, b: T) -> bool
where
    S: Lattice<T>,
    T: Clone + PartialEq,
{
    let join_ab = structure.join_owned(a.clone(), &b);
    let result = structure.meet_owned(a.clone(), &join_ab);
    result == a
}

#[track_caller]
pub(crate) fn assert_lattice<S, T>(structure: &S, a: T, b: T, c: T)
where
    S: Lattice<T>,
    T: Clone + PartialEq,
{
    assert_join_semilattice(structure, a.clone(), b.clone(), c.clone());
    assert_meet_semilattice(structure, a.clone(), b.clone(), c);
    assert!(join_absorption(structure, a.clone(), b.clone()));
    assert!(meet_absorption(structure, a, b));
}

// ========================================================================
// Bounded Lattice Laws
// ========================================================================

/// Verifies bottom is identity for join: `join(bottom(), a) = a`
fn bottom_join_identity<S, T>(structure: &S, a: T) -> bool
where
    S: BoundedJoinSemiLattice<T>,
    T: Clone + PartialEq,
{
    let bottom = structure.bottom();
    let result = structure.join_owned(bottom, &a);
    result == a
}

#[track_caller]
pub(crate) fn assert_bounded_join_semilattice<S, T>(structure: &S, a: T, b: T, c: T)
where
    S: BoundedJoinSemiLattice<T>,
    T: Clone + PartialEq,
{
    assert_join_semilattice(structure, a.clone(), b, c);
    assert!(bottom_join_identity(structure, a));
}

/// Verifies top is identity for meet: `meet(top(), a) = a`
fn top_meet_identity<S, T>(structure: &S, a: T) -> bool
where
    S: BoundedMeetSemiLattice<T>,
    T: Clone + PartialEq,
{
    let top = structure.top();
    let result = structure.meet_owned(top, &a);
    result == a
}

#[track_caller]
pub(crate) fn assert_bounded_meet_semilattice<S, T>(structure: &S, a: T, b: T, c: T)
where
    S: BoundedMeetSemiLattice<T>,
    T: Clone + PartialEq,
{
    assert_meet_semilattice(structure, a.clone(), b, c);
    assert!(top_meet_identity(structure, a));
}

/// Verifies bottom annihilates meet: `meet(bottom(), a) = bottom()`
#[track_caller]
pub(crate) fn assert_bottom_meet_annihilates<S, T>(structure: &S, a: T)
where
    S: BoundedJoinSemiLattice<T> + MeetSemiLattice<T>,
    T: Clone + PartialEq,
{
    let bottom = structure.bottom();
    let result = structure.meet_owned(bottom.clone(), &a);
    assert!(result == bottom);
}

/// Verifies top annihilates join: `join(top(), a) = top()`
#[track_caller]
pub(crate) fn assert_top_join_annihilates<S, T>(structure: &S, a: T)
where
    S: BoundedMeetSemiLattice<T> + JoinSemiLattice<T>,
    T: Clone + PartialEq,
{
    let top = structure.top();
    let result = structure.join_owned(top.clone(), &a);
    assert!(result == top);
}

/// Verifies `is_bottom` consistency: `is_bottom(bottom()) = true`
#[track_caller]
pub(crate) fn assert_is_bottom_consistent<S, T>(structure: &S)
where
    S: HasBottom<T>,
{
    let bottom = structure.bottom();
    assert!(structure.is_bottom(&bottom));
}

/// Verifies `is_top` consistency: `is_top(top()) = true`
#[track_caller]
pub(crate) fn assert_is_top_consistent<S, T>(structure: &S)
where
    S: HasTop<T>,
{
    let top = structure.top();
    assert!(structure.is_top(&top));
}

#[track_caller]
pub(crate) fn assert_bounded_lattice<S, T>(structure: &S, a: T, b: T, c: T)
where
    S: BoundedLattice<T>,
    T: Clone + PartialEq,
{
    assert_bounded_join_semilattice(structure, a.clone(), b.clone(), c.clone());
    assert_bounded_meet_semilattice(structure, a.clone(), b, c);

    assert_bottom_meet_annihilates(structure, a.clone());
    assert_top_join_annihilates(structure, a);

    assert_is_bottom_consistent(structure);
    assert_is_top_consistent(structure);
}
