//! Footprint types for tracking size estimates.
//!
//! A [`Footprint`] combines two measures:
//! - **Units**: How much information a value contains ([`InformationRange`])
//! - **Cardinality**: How many elements it contains ([`Cardinality`])
//!
//! Both measures can be either constant or depend on function parameters via [`AffineEquation`]s.
//!
//! A [`BodyFootprint`] aggregates footprints for all locals and the return value of a function.

use core::{alloc::Allocator, fmt};

use hashql_core::heap::TryCloneIn;

use super::{
    InformationUnit,
    affine::AffineEquation,
    estimate::Estimate,
    range::{Cardinality, InformationRange},
};
use crate::{
    body::local::LocalVec,
    pass::analysis::dataflow::lattice::{
        AdditiveMonoid, HasBottom, JoinSemiLattice, SaturatingSemiring,
    },
};

/// Semilattice for joining [`BodyFootprint`]s during fixpoint iteration.
pub(crate) struct BodyFootprintSemilattice<A: Allocator> {
    pub alloc: A,
    pub domain_size: usize,
    pub args: usize,
}

/// Size estimates for all values in a function body.
///
/// Contains footprints for each local variable and the return value.
#[derive(Debug)]
pub struct BodyFootprint<A: Allocator> {
    /// Number of function arguments (used to size affine coefficient vectors).
    pub args: usize,
    /// Footprint for each local variable, indexed by [`Local`](crate::body::local::Local).
    pub locals: LocalVec<Footprint, A>,
    /// Footprint for the function's return value.
    pub returns: Footprint,
}

impl<A: Allocator, B: Allocator> PartialEq<BodyFootprint<B>> for BodyFootprint<A> {
    fn eq(&self, other: &BodyFootprint<B>) -> bool {
        let Self {
            args,
            locals,
            returns,
        } = self;

        *args == other.args && *locals == other.locals && *returns == other.returns
    }
}

impl<A: Allocator> Eq for BodyFootprint<A> {}

impl<A: Allocator, B: Allocator> TryCloneIn<B> for BodyFootprint<A> {
    type Cloned = BodyFootprint<B>;

    fn try_clone_in(&self, allocator: B) -> Result<Self::Cloned, core::alloc::AllocError> {
        let Self {
            args: params,
            locals,
            returns,
        } = self;

        let locals = locals.try_clone_in(allocator)?;

        Ok(BodyFootprint {
            args: *params,
            locals,
            returns: returns.clone(),
        })
    }

    fn try_clone_into(
        &self,
        into: &mut Self::Cloned,
        allocator: B,
    ) -> Result<(), core::alloc::AllocError> {
        let Self {
            args: params,
            locals,
            returns,
        } = self;

        into.args = *params;
        locals.try_clone_into(&mut into.locals, allocator)?;
        into.returns.clone_from(returns);

        Ok(())
    }
}

impl<A: Allocator + Clone> Clone for BodyFootprint<A> {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            args: self.args,
            locals: self.locals.clone(),
            returns: self.returns.clone(),
        }
    }

    fn clone_from(&mut self, source: &Self) {
        let Self {
            args: params,
            locals,
            returns,
        } = self;

        *params = source.args;
        locals.clone_from(&source.locals);
        returns.clone_from(&source.returns);
    }
}

impl<A: Allocator, B: Allocator> JoinSemiLattice<BodyFootprint<A>, BodyFootprint<B>>
    for BodyFootprintSemilattice<A>
{
    fn join(&self, lhs: &mut BodyFootprint<A>, rhs: &BodyFootprint<B>) -> bool {
        assert_eq!(lhs.locals.len(), rhs.locals.len());

        let mut changed = false;
        for (lhs_local, rhs_local) in lhs.locals.iter_mut().zip(rhs.locals.iter()) {
            changed |= SaturatingSemiring.join(lhs_local, rhs_local);
        }
        changed |= SaturatingSemiring.join(&mut lhs.returns, &rhs.returns);

        changed
    }
}

impl<A: Allocator + Clone> HasBottom<BodyFootprint<A>> for BodyFootprintSemilattice<A> {
    fn bottom(&self) -> BodyFootprint<A> {
        BodyFootprint {
            args: self.args,
            locals: LocalVec::from_elem_in(
                SaturatingSemiring.bottom(),
                self.domain_size,
                self.alloc.clone(),
            ),
            returns: SaturatingSemiring.bottom(),
        }
    }

    fn is_bottom(&self, value: &BodyFootprint<A>) -> bool {
        value
            .locals
            .iter()
            .all(|local| SaturatingSemiring.is_bottom(local))
            && SaturatingSemiring.is_bottom(&value.returns)
    }
}

impl<A: Allocator> fmt::Display for BodyFootprint<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(fmt, "({} args)", self.args)?;

        for (local, footprint) in self.locals.iter_enumerated() {
            writeln!(fmt, "  {local}: {footprint}")?;
        }

        writeln!(fmt, "  returns: {}", self.returns)
    }
}

/// Combined size measure tracking both information content and element count.
///
/// Each measure can be either a constant range or an affine equation of the function's parameters.
#[derive(Debug, PartialEq, Eq)]
pub struct Footprint {
    /// The amount of information this value contains.
    pub units: Estimate<InformationRange>,
    /// The number of elements this value contains.
    pub cardinality: Estimate<Cardinality>,
}

impl Footprint {
    /// A footprint for scalar values (primitives, unit, function pointers).
    ///
    /// Has exactly 1 unit of information and cardinality of 1.
    #[must_use]
    pub const fn scalar() -> Self {
        Self {
            units: Estimate::Constant(InformationRange::one()),
            cardinality: Estimate::Constant(Cardinality::one()),
        }
    }

    /// A footprint for values with unknown size (e.g., external inputs).
    ///
    /// Has unbounded information content but cardinality of 1.
    #[must_use]
    pub const fn unknown() -> Self {
        Self {
            units: Estimate::Constant(InformationRange::full()),
            cardinality: Estimate::Constant(Cardinality::one()),
        }
    }

    /// A footprint for values with unknown size (e.g., external inputs).
    ///
    /// Has unbounded information content and cardinality.
    #[must_use]
    pub const fn full() -> Self {
        Self {
            units: Estimate::Constant(InformationRange::full()),
            cardinality: Estimate::Constant(Cardinality::full()),
        }
    }

    #[must_use]
    pub const fn one(units: Estimate<InformationRange>) -> Self {
        Self {
            units,
            cardinality: Estimate::Constant(Cardinality::one()),
        }
    }

    /// A footprint that tracks dependency on a function parameter.
    ///
    /// Both units and cardinality are set to equal the parameter at `index`.
    #[must_use]
    pub fn coefficient(index: usize, length: usize) -> Self {
        Self {
            units: Estimate::Affine(AffineEquation::coefficient(index, length)),
            cardinality: Estimate::Affine(AffineEquation::coefficient(index, length)),
        }
    }

    #[must_use]
    pub fn average(
        &self,
        units: &[InformationRange],
        cardinality: &[Cardinality],
    ) -> Option<InformationUnit> {
        let units = self.units.eval(&SaturatingSemiring, units);
        let cardinality = self.cardinality.eval(&SaturatingSemiring, cardinality);

        if units.is_empty() || cardinality.is_empty() {
            return Some(InformationUnit::new(0));
        }

        let max = units.inclusive_max()?;
        let max = max.checked_mul(cardinality.inclusive_max()?)?;

        let min = units.min();
        let min = min.checked_mul(cardinality.min())?;

        let avg = min.midpoint(max);
        Some(avg)
    }

    /// Collapses this footprint into a total information estimate.
    ///
    /// Multiplies units by cardinality to produce a single information measure
    /// representing the total information content. This is used when a value is
    /// embedded as a field of a composite type, where the per-element vs. element-count
    /// distinction is no longer relevant.
    ///
    /// For constant footprints the multiplication is exact. For affine units with
    /// constant cardinality, coefficients are scaled by the cardinality upper bound
    /// (over-approximation). When at least one side is affine, element-wise
    /// coefficient multiplication preserves same-parameter dependencies
    /// (under-approximation of the quadratic product).
    pub(crate) fn materialize(&self) -> Estimate<InformationRange> {
        let Self { units, cardinality } = self;

        // Cardinality of exactly 1: units already represents the total
        if *cardinality == Estimate::Constant(Cardinality::one()) {
            return units.clone();
        }

        match (units, cardinality) {
            // Both constant: exact range multiplication.
            (Estimate::Constant(units), Estimate::Constant(cardinality)) => {
                Estimate::Constant(units.saturating_mul_cardinality(*cardinality))
            }
            // Affine units, constant cardinality: scale all terms by cardinality.
            // Constant part is multiplied exactly. Coefficients are scaled by the
            // cardinality upper bound, which is exact for point ranges and an
            // over-approximation for wider ranges.
            (Estimate::Affine(units_eq), Estimate::Constant(cardinality)) => {
                let Some(cardinality_max) = cardinality.inclusive_max() else {
                    // Unbounded cardinality: cannot bound the total
                    return Estimate::Constant(InformationRange::full());
                };

                let scale = u16::try_from(cardinality_max.raw).unwrap_or(u16::MAX);

                let mut result = units_eq.clone();
                result.constant = result.constant.saturating_mul_cardinality(*cardinality);
                for coefficient in &mut result.coefficients {
                    *coefficient = coefficient.saturating_mul(scale);
                }

                Estimate::Affine(result)
            }
            // At least one side is affine: element-wise coefficient multiplication
            // gives a linear under-approximation of the quadratic product. This
            // preserves parameter dependency for the common case where both
            // dimensions track the same parameter. When units is constant (all
            // zero coefficients), the element-wise product correctly yields zero
            // coefficients, leaving only the constant-times-constant term.
            _ => {
                let mut result = units.clone();
                result.saturating_coeff_mul(cardinality);
                let range = result
                    .constant()
                    .saturating_mul_cardinality(*cardinality.constant());
                *result.constant_mut() = range;

                result
            }
        }
    }

    /// Adds `other * coefficient` to this footprint (component-wise).
    pub(crate) fn saturating_mul_add(
        &mut self,
        other: &Self,
        units_coefficient: u16,
        cardinality_coefficient: u16,
    ) {
        self.units
            .saturating_mul_add(&other.units, units_coefficient);
        self.cardinality
            .saturating_mul_add(&other.cardinality, cardinality_coefficient);
    }
}

impl Clone for Footprint {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            units: self.units.clone(),
            cardinality: self.cardinality.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self { units, cardinality } = self;

        units.clone_from(&source.units);
        cardinality.clone_from(&source.cardinality);
    }
}

impl fmt::Display for Footprint {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "units: {}, cardinality: {}",
            self.units, self.cardinality
        )
    }
}

impl AdditiveMonoid<Footprint> for SaturatingSemiring {
    fn zero(&self) -> Footprint {
        Footprint {
            units: self.zero(),
            cardinality: self.zero(),
        }
    }

    fn plus(&self, lhs: &mut Footprint, rhs: &Footprint) -> bool {
        // Use `|` not `||` to ensure both fields are updated
        self.plus(&mut lhs.units, &rhs.units) | self.plus(&mut lhs.cardinality, &rhs.cardinality)
    }
}

impl JoinSemiLattice<Footprint> for SaturatingSemiring {
    fn join(&self, lhs: &mut Footprint, rhs: &Footprint) -> bool {
        // Use `|` not `||` to ensure both fields are updated
        self.join(&mut lhs.units, &rhs.units) | self.join(&mut lhs.cardinality, &rhs.cardinality)
    }
}

impl HasBottom<Footprint> for SaturatingSemiring {
    fn bottom(&self) -> Footprint {
        Footprint {
            units: self.bottom(),
            cardinality: self.bottom(),
        }
    }

    fn is_bottom(&self, value: &Footprint) -> bool {
        self.is_bottom(&value.units) && self.is_bottom(&value.cardinality)
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::min_ident_chars)]
    use alloc::alloc::Global;
    use core::{iter, ops::Bound};

    use super::{BodyFootprint, BodyFootprintSemilattice};
    use crate::{
        body::local::LocalVec,
        pass::analysis::{
            dataflow::lattice::{
                SaturatingSemiring,
                laws::{
                    assert_additive_monoid, assert_bounded_join_semilattice,
                    assert_is_bottom_consistent,
                },
            },
            size_estimation::{
                AffineEquation, Cardinal, Cardinality, Footprint, InformationRange,
                InformationUnit, estimate::Estimate,
            },
        },
    };

    #[test]
    fn scalar_footprint_values() {
        let scalar = Footprint::scalar();

        let Estimate::Constant(units_range) = &scalar.units else {
            panic!("expected Constant variant for units");
        };
        assert_eq!(units_range, &InformationRange::one());

        let Estimate::Constant(card_range) = &scalar.cardinality else {
            panic!("expected Constant variant for cardinality");
        };
        assert_eq!(card_range, &Cardinality::one());
    }

    #[test]
    fn unknown_footprint_values() {
        let unknown = Footprint::unknown();

        let Estimate::Constant(units_range) = &unknown.units else {
            panic!("expected Constant variant for units");
        };
        assert_eq!(units_range, &InformationRange::full());

        let Estimate::Constant(card_range) = &unknown.cardinality else {
            panic!("expected Constant variant for cardinality");
        };
        assert_eq!(card_range, &Cardinality::one());
    }

    #[test]
    fn coefficient_footprint_structure() {
        let footprint = Footprint::coefficient(2, 5);

        let Estimate::Affine(units_eq) = &footprint.units else {
            panic!("expected Affine variant for units");
        };
        assert_eq!(units_eq.coefficients.as_slice(), &[0, 0, 1, 0, 0]);

        let Estimate::Affine(card_eq) = &footprint.cardinality else {
            panic!("expected Affine variant for cardinality");
        };
        assert_eq!(card_eq.coefficients.as_slice(), &[0, 0, 1, 0, 0]);
    }

    #[test]
    fn saturating_mul_add_applies_coefficients_independently() {
        let mut footprint = Footprint::scalar();
        let other = Footprint::scalar();

        footprint.saturating_mul_add(&other, 3, 5);

        let Estimate::Constant(units_range) = &footprint.units else {
            panic!("expected Constant variant for units");
        };
        assert_eq!(
            units_range,
            &InformationRange::new(
                InformationUnit::new(4),
                Bound::Included(InformationUnit::new(4))
            )
        );

        let Estimate::Constant(card_range) = &footprint.cardinality else {
            panic!("expected Constant variant for cardinality");
        };
        assert_eq!(
            card_range,
            &Cardinality::new(Cardinal::new(6), Bound::Included(Cardinal::new(6)))
        );
    }

    #[test]
    fn laws() {
        let a = Footprint::scalar();
        let b = Footprint::unknown();
        let c = Footprint::coefficient(0, 3);

        assert_additive_monoid(&SaturatingSemiring, a.clone(), b.clone(), c.clone());
        assert_bounded_join_semilattice(&SaturatingSemiring, a, b, c);
        assert_is_bottom_consistent::<SaturatingSemiring, Footprint>(&SaturatingSemiring);

        let lattice = BodyFootprintSemilattice {
            alloc: Global,
            domain_size: 4,
            args: 2,
        };

        let body_a = BodyFootprint {
            args: 2,
            locals: LocalVec::from_elem_in(Footprint::scalar(), 4, Global),
            returns: Footprint::scalar(),
        };
        let body_b = BodyFootprint {
            args: 2,
            locals: LocalVec::from_elem_in(Footprint::unknown(), 4, Global),
            returns: Footprint::unknown(),
        };
        let body_c = BodyFootprint {
            args: 2,
            locals: LocalVec::from_elem_in(Footprint::coefficient(0, 2), 4, Global),
            returns: Footprint::coefficient(1, 2),
        };

        assert_bounded_join_semilattice(&lattice, body_a, body_b, body_c);
        assert_is_bottom_consistent::<_, BodyFootprint<Global>>(&lattice);
    }

    #[test]
    fn materialize_scalar_is_identity() {
        // (units=1, cardinality=1) -> 1*1 = 1
        let result = Footprint::scalar().materialize();
        assert_eq!(result, Estimate::Constant(InformationRange::one()));
    }

    #[test]
    fn materialize_constant_collection() {
        // (units=1..=1, cardinality=5..=5) -> 1*5 = 5..=5
        let footprint = Footprint {
            units: Estimate::Constant(InformationRange::one()),
            cardinality: Estimate::Constant(Cardinality::value(Cardinal::new(5))),
        };

        let result = footprint.materialize();

        assert_eq!(
            result,
            Estimate::Constant(InformationRange::value(InformationUnit::new(5)))
        );
    }

    #[test]
    fn materialize_affine_units_constant_cardinality() {
        // units = 2..=3 + 1*p0, cardinality = 5..=5
        // expected: (2*5)..=(3*5) + 5*p0 = 10..=15 + 5*p0
        let footprint = Footprint {
            units: Estimate::Affine(AffineEquation {
                coefficients: [1, 0].into_iter().collect(),
                constant: InformationRange::new(
                    InformationUnit::new(2),
                    Bound::Included(InformationUnit::new(3)),
                ),
            }),
            cardinality: Estimate::Constant(Cardinality::value(Cardinal::new(5))),
        };

        let result = footprint.materialize();

        let Estimate::Affine(eq) = &result else {
            panic!("expected Affine, got {result:?}");
        };
        assert_eq!(eq.coefficients.as_slice(), &[5, 0]);
        assert_eq!(
            eq.constant,
            InformationRange::new(
                InformationUnit::new(10),
                Bound::Included(InformationUnit::new(15))
            )
        );
    }

    #[test]
    fn materialize_constant_units_affine_cardinality() {
        // units = 3..=3, cardinality = 0..0 + 1*p0
        // Constant units with affine cardinality: coefficients are all zero,
        // so the result is just constant * constant = 3..=3 * 0..0 = empty
        let footprint = Footprint {
            units: Estimate::Constant(InformationRange::value(InformationUnit::new(3))),
            cardinality: Estimate::Affine(AffineEquation {
                coefficients: iter::once(1).collect(),
                constant: Cardinality::empty(),
            }),
        };

        let result = footprint.materialize();

        // Zero coefficients (0*1=0), constant 3*empty=empty
        assert_eq!(*result.constant(), InformationRange::empty());
        assert!(result.coefficients().iter().all(|&c| c == 0));
    }

    #[test]
    fn materialize_both_affine_same_parameter() {
        // Both depend on param 0: units = 0..0 + 1*p0, cardinality = 0..0 + 1*p0
        // Element-wise: coeffs[0] = 1*1 = 1, constant = empty * empty = empty
        let footprint = Footprint::coefficient(0, 2);

        let result = footprint.materialize();

        let Estimate::Affine(eq) = &result else {
            panic!("expected Affine, got {result:?}");
        };
        assert_eq!(eq.coefficients.as_slice(), &[1, 0]);
        assert_eq!(eq.constant, InformationRange::empty());
    }

    #[test]
    fn materialize_zeroes_trailing_coefficients() {
        // units depends on params 0, 1, 2; cardinality depends only on param 0.
        // Params 1 and 2 have implicit zero in cardinality, so the product
        // should drop those coefficients rather than preserving them.
        // units = 0..0 + 3*p0 + 5*p1 + 7*p2
        // cardinality = 0..0 + 2*p0
        // element-wise: [3*2] = [6] (trailing terms truncated)
        let footprint = Footprint {
            units: Estimate::Affine(AffineEquation {
                coefficients: [3, 5, 7].into_iter().collect(),
                constant: InformationRange::empty(),
            }),
            cardinality: Estimate::Affine(AffineEquation {
                coefficients: iter::once(2).collect(),
                constant: Cardinality::empty(),
            }),
        };

        let result = footprint.materialize();

        let Estimate::Affine(eq) = &result else {
            panic!("expected Affine, got {result:?}");
        };
        assert_eq!(eq.coefficients.as_slice(), &[6]);
        assert_eq!(eq.constant, InformationRange::empty());
    }
}
