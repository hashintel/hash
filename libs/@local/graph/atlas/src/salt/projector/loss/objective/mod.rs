//! The target objective's batch term, the declared estimand folded over one drawn batch.
//!
//! The declared estimand is a fixed-denominator weighted mean over the declared unit population.
//! Each unit reads the contrast violation on its endpoint pair, the penalty maps the violation to
//! a value, and the unit's mass is its weight over the population's total weight. A batch
//! estimates the mean without bias by dividing each included unit's contribution by that unit's
//! first-order inclusion probability under the declared draw law, summed over the distinct
//! included units. The released trainer scales its relation term by the drawn-group ratio alone,
//! which estimates a per-type clipped objective instead of the declared mean. Dividing by the
//! full per-unit probability is an intentional divergence from the released curriculum, required
//! by the derivation's estimator contract.
//!
//! A unit's weight retains exactly the released factors that are unit mass. The per-instance
//! effective confidence and degree normalization enter, and so does the relation's frozen
//! strength multiplier. The class masses stay out because they weight the penalty family's class
//! energies rather than unit mass. The composite objective's term coefficient stays out because
//! composition carries no per-unit structure. The step factor selects the canonical condition and
//! never multiplies: the canonical coordinates handed to this term are the canonical step's
//! field, and no lens factor exists here. The force-pruning threshold decides population
//! membership before any unit reaches this module.
//!
//! The treatment activation scales every force this term emits and never its reading. At zero
//! activation the same arithmetic runs over the same units and adds exactly zero to every gradient
//! channel whenever every unit's mass, penalty slope, zero slope and fitted-scale slope are finite,
//! which is what lets a reference replicate run the same law with the target code path live rather
//! than removed. The other factors the force meets are the canonical slope, the distances and the
//! coordinate differences. The canonical slope is finite at every input. The fields prove each
//! coordinate finite and nothing about the differences: the estimator subtracts in `f32` and
//! squares and sums the differences in `f32`, and endpoints such as `(f32::MAX, 0)` and
//! `(-f32::MAX, 0)` read an infinite difference and an infinite computed distance. The
//! fitted-scale slope `d_c/σ₀` is infinite for an overflowed canonical distance, and the
//! differences, the distances and that slope are finite for finite computed distances. The force
//! is the activation times the unit's mass times the penalty slope, multiplied left to right, and
//! a zero activation against an infinite hinge slope or an infinite mass reads `0 · ∞`, which is
//! NaN rather than zero. The scale pull multiplies the force by the fitted-scale slope, and a zero
//! force against an infinite one reads NaN while the canonical branch skips that overflowed
//! distance. The zero-side deposit, taken for a finite positive computed zero distance, multiplies
//! the force by the zero slope, which is `−∞` for a ruler at or below `2⁻¹²⁸`, the bound
//! [`TargetUnit::ruler`] states: a zero force against it reads NaN as well. The direct coordinate
//! deposits skip a zero or an overflowed distance outright, at any force.
//!
//! The fitted alignment scale is live, and its adjoint is real force. The term accumulates the
//! pull on the scale across units and returns it, and [`fan_scale_pull`] carries that pull into
//! the gauge anchors' coordinates through the fit's exact adjoints. The direct coordinate
//! channels and the scale channel together are the estimator's whole derivative, and dropping
//! either half would misstate the derivative the optimizer consumes.

#[cfg(test)]
mod tests;

use core::num::NonZero;

use hashql_core::id::{Id, IdSlice};

use super::{GradientField, contrast::ContrastEnergy, penalty::Penalty};
use crate::{
    math::{
        DFinite, DNonNegative, DPositive, DVec2, Derivation, Diverged, Finite, FinitePointField,
        NonNegative, Positive, PositiveUnitFraction, UnitFraction,
    },
    salt::projector::gauge::{GaugeFit, GaugeOrdinal},
};

/// The declaration of what one estimand unit is, over the admitted attraction instances.
///
/// The unit of account is domain identity, declared rather than derived, and only the
/// factorization conditional on that declaration is fixed here. The trainer consumes the law as
/// a declared input and conditions every population derivation on it: a new declaration adds a
/// variant here and its derivations at the match arms the compiler names.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum UnitLaw {
    /// One unit per admitted force-bearing link instance, weighted by the released census factors.
    ///
    /// This is the released pipeline's own unit of account.
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "the selected unit law for the planned calibration; consumed when the band \
                      trainer is wired"
        )
    )]
    PerLinkInstance,
}

/// One declared unit of the target estimand, drawn into a batch.
///
/// The endpoint rows index the coordinate domain the term evaluates against. The ruler is the
/// pair's frozen band-reference scale, gathered from the frozen table before re-indexing. The
/// weight is the unit's declared mass, aggregated over the unit's instances as the unit law
/// declares. The inclusion probability is the draw law's full first-order probability for this
/// unit, the divisor that makes the batch sum unbiased.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct TargetUnit<N> {
    /// The unit's source row.
    pub source: N,
    /// The unit's target row.
    pub target: N,
    /// The pair's frozen ruler `σ₀(e)`.
    ///
    /// The zero slope's `f32` reciprocal needs a ruler above `2⁻¹²⁸`. A denominator of the checked
    /// [`FrozenRuler`](crate::salt::projector::scale::frozen::FrozenRuler) lies above that bound.
    /// The freeze admits `ε` only with `ε² ≥ 2⁻¹⁴⁹`, which puts `ε` above `2⁻⁷⁵`. Every stored
    /// `ρ₀ + ε` is at least `ε`, and their geometric mean rounds within the operands' range. A
    /// directly constructed unit owes the bound on its own.
    pub ruler: Positive,
    /// The unit's weight `w(e)`.
    pub weight: DNonNegative,
    /// The unit's first-order inclusion probability `π(e)`.
    pub inclusion: PositiveUnitFraction,
}

/// Computes the released factorization's unit weight `w(e) = c · ν · h`.
///
/// Confidence, normalization, and strength are the released census's retained members, and the
/// class masses never enter. Zero confidence is admissible and folds in as a zero-force unit.
/// The strength multiplier is exactly one while the strength head is off.
#[must_use]
pub(crate) const fn released_weight(
    confidence: UnitFraction,
    normalization: PositiveUnitFraction,
    strength: NonNegative,
) -> DNonNegative {
    (confidence * normalization) * DNonNegative::from(strength)
}

/// The released relation draw law, priced per unit.
///
/// The released sampler selects relation types uniformly without replacement and then selects
/// distinct edges uniformly without replacement inside each chosen type. Every drawn unit
/// therefore appears exactly once, and the deduplicated-set estimator form applies. Under that
/// law a unit's full first-order inclusion probability factors into the group's selection
/// probability times the within-group selection probability, and [`CappedDrawLaw::inclusion`]
/// evaluates exactly that product.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct CappedDrawLaw {
    drawn: NonZero<usize>,
    total: NonZero<usize>,
    cap: NonZero<usize>,
}

impl CappedDrawLaw {
    /// Binds one draw's group counts and per-type cap.
    ///
    /// `drawn` is the number of relation types the draw selected out of the population's
    /// `total`, and `cap` is the per-type edge cap.
    ///
    /// # Panics
    ///
    /// This panics when more groups are drawn than exist. The counts come from one sampler call,
    /// and a violation is therefore a wiring defect.
    #[must_use]
    pub(crate) fn new(drawn: NonZero<usize>, total: NonZero<usize>, cap: NonZero<usize>) -> Self {
        assert!(
            drawn <= total,
            "a draw cannot select more relation types than exist"
        );

        Self { drawn, total, cap }
    }

    /// Prices one unit's inclusion probability `π(e) = (g/G) · (min(cap, M)/M)`.
    ///
    /// `group_size` is the unit's relation type's admitted instance count `M`. A type no larger
    /// than the cap contributes all its edges when selected, and its within-group factor is one.
    #[expect(
        clippy::cast_precision_loss,
        reason = "group counts stay far below f64's exact-integer range for ratio purposes"
    )]
    #[must_use]
    pub(crate) fn inclusion(&self, group_size: NonZero<usize>) -> PositiveUnitFraction {
        let group = self.drawn.get() as f64 / self.total.get() as f64;
        let within = self.cap.get().min(group_size.get()) as f64 / group_size.get() as f64;

        // In domain with no check: each ratio is a positive quotient of a positive numerator
        // by a bound at least as large. Both round inside (0, 1], and their product cannot
        // cross either endpoint.
        PositiveUnitFraction::new_unchecked(group * within)
    }
}

/// One batch evaluation's reading.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct TargetReading {
    /// The estimand estimate `L̂`, never scaled by the activation.
    ///
    /// The reading stays live at zero activation, where a reference replicate still reads what the
    /// target term would score. The composite objective's value contribution is the activation
    /// times this reading. The domain is signed: under the [`Penalty::Identity`] shape a satisfied
    /// unit's negative violation subtracts value.
    pub estimand: Finite,
    /// The accumulated pull on the fitted scale, activation-scaled like the gradient fields.
    ///
    /// Non-negative by construction: the force and the fitted-scale slope both are, and every
    /// accumulated term is their product. [`fan_scale_pull`] carries it into the gauge anchors'
    /// coordinates.
    pub scale_pull: DNonNegative,
}

/// The batch estimator's evaluation constants.
///
/// One instance holds what stays fixed across the units of one evaluation. The energy carries
/// the fitted scale and the margin, the penalty is the declared `φ`, the population weight is
/// the split-time total `W`, and the activation is the treatment coefficient `λ`.
///
/// The population weight's domain is strictly positive because an empty population makes the run
/// vacuous at split time, before any fit exists to evaluate, and positivity alone does not make
/// the mass quotient total. The divisor is the `f64` product `W·π(e)`, which `f64`
/// multiplication rounds to zero for an exact product at or below `2⁻¹⁰⁷⁵`. The quotient has a
/// nonzero divisor exactly when that product remains a representable positive value, a condition
/// the weight's own domain cannot guarantee: `2⁻¹⁰⁷⁴`, the smallest positive `f64`, is an
/// admitted population weight whose product with an inclusion of one half is zero. A nonzero
/// divisor does not bound the quotient: with a unit weight of one, `W = 1` and an inclusion of
/// `2⁻¹⁰⁷⁴` (admitted by [`PositiveUnitFraction::new`]), the divisor is a representable positive
/// and the quotient reads `+∞`. The mass is finite exactly when the divisor is a representable
/// positive and the quotient rounds inside the finite `f64` range. Against a zero divisor the mass
/// reads infinite for a positive unit weight and NaN for a zero one. An infinite mass makes every
/// fold term it enters non-finite, and the folds' finish refuses the reading in either case.
#[derive(Debug, Copy, Clone)]
pub(crate) struct TargetEstimator {
    energy: ContrastEnergy,
    penalty: Penalty,
    population_weight: DPositive,
    activation: NonNegative,
}

impl TargetEstimator {
    /// Binds one evaluation's constants.
    #[must_use]
    pub(crate) const fn new(
        energy: ContrastEnergy,
        penalty: Penalty,
        population_weight: DPositive,
        activation: NonNegative,
    ) -> Self {
        Self {
            energy,
            penalty,
            population_weight,
            activation,
        }
    }

    /// Folds the estimand over one batch of units, accumulating coordinate gradients.
    ///
    /// Adds `activation · w(e)/(W·π(e)) · φ′(v(e))` times each live partial's direction to the
    /// two fields and returns the reading. The declared penalty evaluates value and slope in one
    /// implementation, finite at every finite working-precision violation by construction. Either
    /// its slope is nonzero at a zero violation, or a positive margin makes distance equality a
    /// nonzero violation. Admission enforces that pairing through [`Penalty::dead_at_equality`].
    ///
    /// A coincident endpoint pair on either side has no direction on that side. That side folds a
    /// zero contribution while the value still counts, matching the contract of
    /// [`ContrastEnergy::evaluate`], and the branch skips the deposit outright, at any force. The
    /// same branch skips a distance whose `f32` computation overflowed to `+∞`:
    /// `NonNegative::positive` is `Positive::new`, which refuses zero and infinity alike. A
    /// canonical coincidence also reads a zero scale slope, whose product with a finite force adds
    /// no pull. Against an infinite or NaN force the product is NaN, and the scale fold refuses it
    /// at its finish.
    ///
    /// The deposits themselves pass no check. Each multiplies the force by the side's slope over
    /// its distance and by the coordinate difference. The canonical slope is finite at every input.
    /// The distances and the differences compute in `f32` from coordinates the fields prove finite
    /// one by one: the subtraction overflows for endpoints such as `(f32::MAX, 0)` and
    /// `(-f32::MAX, 0)`, and the square-and-sum for a difference of `2⁶⁴` or more. An overflowed
    /// distance skips its branch, and a taken branch therefore has a finite positive distance and
    /// finite differences. The zero slope is `−∞` for a ruler at or below `2⁻¹²⁸`, the bound
    /// [`TargetUnit::ruler`] states. Against that slope, on a taken zero-side branch, a positive
    /// finite force deposits infinities along the nonzero components of the zero difference and NaN
    /// along the zero ones, and a zero force deposits NaN along both. The finishes read the
    /// estimand and the scale pull, neither of which the zero slope enters, and with both in domain
    /// the call returns `Ok` while the zero field holds those entries.
    ///
    /// # Errors
    ///
    /// Returns [`Diverged`] carrying the diverged fold's raw value when an accumulated reading lies
    /// outside its domain, or when the finished estimand overflows the narrowing to its
    /// single-width storage (the carried raw value is then the double-width one). The folds are
    /// unbounded and data-dependent, and the refusal happens at the folds' finish, after every
    /// unit has contributed. The estimand fold checks the accumulated products of mass and
    /// penalty value, never the penalty's own output. That output is infinite for a violation
    /// overflowed to `+∞` under either variant. For one overflowed to `−∞` it is `−∞` under
    /// [`Penalty::Identity`] and the zero branch's `(0, 0)` under [`Penalty::QuadraticHinge`],
    /// which adds nothing while the mass is finite. A positive mass carries an infinite value into
    /// the sum as that infinity, and a zero mass, which a zero unit weight produces, carries it as
    /// NaN, the product `0 · ∞`. Under [`Penalty::Identity`] the opposite infinities of two units
    /// also sum to NaN. A divisor `W·π(e)` rounded to zero, or a quotient that overflows `f64`
    /// over a representable divisor, reads a non-finite mass, and every term it enters is
    /// non-finite, the hinge's zero value included. The finish refuses each of these sums. The
    /// force takes the same products: an infinite hinge slope deposits non-finite coordinate
    /// gradients, infinite along a nonzero difference component and NaN along a zero one or at a
    /// zero activation or a zero mass. The coordinate fields keep every deposit made before a
    /// refusal, these included. No finish reads the coordinate fields, and a non-finite deposit
    /// alone refuses nothing. With both folds in domain, a ruler at or below `2⁻¹²⁸` returns `Ok`
    /// and non-finite zero-side deposits for every unit whose computed zero distance is finite and
    /// positive. A zero or overflowed zero distance takes no zero-side branch. An overflowed
    /// canonical distance reads an infinite fitted-scale slope and, against a finite zero
    /// distance, a `+∞` violation: both folds read non-finite values, and the finish refuses the
    /// reading under either penalty. An overflowed zero distance against a finite aligned distance
    /// `s·d_c` reads a `−∞` violation and takes no zero-side branch: [`Penalty::Identity`] refuses
    /// the value and the hinge folds it as nothing. An infinite aligned distance against an
    /// infinite zero distance reads NaN, the difference `∞ − ∞`, whether the canonical distance
    /// overflowed or the product `s·d_c` alone did. [`Penalty::Identity`] carries the NaN into the
    /// estimand fold, which refuses it. The hinge takes its `(0, 0)` branch. The estimand fold
    /// reads zero for a finite mass and the force is zero. The reading then rests on the scale
    /// fold, where that force meets the fitted-scale slope. With the canonical distance overflowed
    /// the slope is infinite, the product reads NaN, and the scale fold refuses. With the canonical
    /// distance finite and the product alone overflowed, the slope is finite, the scale fold adds
    /// nothing, the canonical branch deposits the zero force along its finite distance, and the
    /// call returns `Ok`. A diverged reading is an expected numerical refusal that the caller
    /// owns.
    ///
    /// # Panics
    ///
    /// This panics when the canonical and zero fields cover different row counts, or when a unit
    /// references a row outside them. Fields, units, and coordinates come from one batch assembly
    /// over one forward pass, and a mismatch is therefore a wiring defect.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "a canonical/zero row mismatch is a wiring defect, not a recoverable error"
    )]
    pub(crate) fn evaluate<N>(
        &self,
        canonical: &FinitePointField<N>,
        zero: &FinitePointField<N>,
        units: &[TargetUnit<N>],
        canonical_field: &mut GradientField<N>,
        zero_field: &mut GradientField<N>,
    ) -> Result<TargetReading, Diverged<f64>>
    where
        N: Id,
    {
        assert_eq!(
            canonical.len(),
            zero.len(),
            "the canonical and zero fields should cover the same rows"
        );

        let denominator = self.population_weight;
        let activation = self.activation.widen();

        // Accumulated in double precision, products included. The mass and force factors are
        // unbounded and data-dependent. Both folds run as derivations and make their one claim
        // at the reading's construction.
        let mut estimand = Derivation::<DFinite>::ZERO;
        let mut scale_pull = Derivation::<DNonNegative>::ZERO;

        for unit in units {
            let (source, target) = (unit.source, unit.target);
            let canonical_difference = canonical[source] - canonical[target];
            let zero_difference = zero[source] - zero[target];
            // `length` squares and sums the `f32` differences: an overflow escapes to `+∞` here
            // and asserts with debug assertions enabled, ahead of every fold. The energy's
            // `div_wide` carries an escaped canonical distance into the fitted-scale slope as `+∞`.
            let canonical_distance = canonical_difference.length();
            let zero_distance = zero_difference.length();

            let evaluation = self
                .energy
                .evaluate(unit.ruler, canonical_distance, zero_distance);
            let (value, slope) = self.penalty.evaluate(f64::from(evaluation.violation));

            // the estimator mass is w(e)/(W·π(e)). A denominator rounded to zero can produce an
            // infinite or NaN mass. Validation belongs to the accumulated readings below.
            let mass = (Derivation::from(unit.weight) / (denominator * unit.inclusion)).into_raw();
            estimand = Derivation::<DFinite>::raw(mass)
                .mul_add(Derivation::<DFinite>::raw(value), estimand);

            let force = activation * mass * slope;
            scale_pull = Derivation::from(evaluation.fitted_scale_slope)
                .mul_add(Derivation::<DNonNegative>::raw(force), scale_pull);

            if let Some(distance) = canonical_distance.positive() {
                // dv/dy_source = canonical_slope · (y_source - y_target)/d_c.
                let gradient = DVec2::from(canonical_difference)
                    * (force * evaluation.canonical_slope / distance.widen());
                canonical_field.add(source, gradient);
                canonical_field.add(target, -gradient);
            }

            if let Some(distance) = zero_distance.positive() {
                // dv/dy_source = zero_slope · (y_source - y_target)/d₀, the honest reward for
                // inflating a zero distance, held by the band projection and never hidden. The
                // branch runs for a finite positive computed distance alone: `positive()` refuses
                // zero and an escaped `+∞`. The slope is `−∞` for a ruler at or below 2⁻¹²⁸
                // (`Positive::recip` divides in `f32`), and `add` deposits the product unchecked.
                let gradient = DVec2::from(zero_difference)
                    * (force * f64::from(evaluation.zero_slope) / distance.widen());
                zero_field.add(source, gradient);
                zero_field.add(target, -gradient);
            }
        }

        // The folds are unbounded: the overflow window is lawful input, and the narrow is the
        // checked form rather than the escape.
        let estimand = estimand.finish()?;

        Ok(TargetReading {
            estimand: estimand.narrow().ok_or_else(|| Diverged {
                raw: estimand.get(),
            })?,
            scale_pull: scale_pull.finish()?,
        })
    }
}

/// Carries the accumulated scale pull into the gauge anchors' coordinate gradients.
///
/// Adds `pull · ∂s/∂x_c(g)` to each anchor's canonical entry and `pull · ∂s/∂x₀(g)` to its zero
/// entry, completing the fitted scale's channel of the estimator's derivative. `rows` is the
/// gauge's anchor list in draw order, and the fields must speak the same row domain.
///
/// # Panics
///
/// This panics when the anchor rows and the fit disagree about the anchor count, or when an
/// anchor row lies outside a field. The rows and the fit come from one gauge, and a mismatch is
/// therefore a wiring defect.
pub(crate) fn fan_scale_pull<N>(
    pull: DNonNegative,
    fit: &GaugeFit,
    rows: &IdSlice<GaugeOrdinal, N>,
    canonical_field: &mut GradientField<N>,
    zero_field: &mut GradientField<N>,
) where
    N: Id,
{
    assert_eq!(
        rows.len(),
        fit.canonical_adjoints().len(),
        "the anchor rows and the fitted adjoints should come from one gauge"
    );

    for (ordinal, &row) in rows.iter_enumerated() {
        canonical_field.add(row, DVec2::from(fit.canonical_adjoints()[ordinal]) * pull);
        zero_field.add(row, DVec2::from(fit.zero_adjoints()[ordinal]) * pull);
    }
}
