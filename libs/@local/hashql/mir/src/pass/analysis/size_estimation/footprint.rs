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
    use core::ops::Bound;

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
                Cardinal, Cardinality, Footprint, InformationRange, InformationUnit,
                estimate::Estimate,
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
}
