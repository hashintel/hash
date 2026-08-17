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
//! energies, which decision 4 owns. The composite objective's term coefficient stays out because
//! composition carries no per-unit structure. The rung factor selects the canonical condition and
//! never multiplies, so the canonical coordinates handed to this term are the canonical rung's
//! field and no lens factor exists here. The force-pruning threshold decides population
//! membership before any unit reaches this module.
//!
//! The treatment activation scales every force this term emits and never its reading. At zero
//! activation the same arithmetic runs over the same units and adds exactly zero to every
//! gradient, which is what lets a reference replicate run the same law with the target code path
//! live rather than removed.
//!
//! The fitted alignment scale is live, so its adjoint is real force. The term accumulates the
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
        DFinite, DNonNegative, DPositive, DVec2, Finite, NonNegative, Positive,
        PositiveUnitFraction, UnitFraction, Vec2,
    },
    salt::projector::gauge::{GaugeFit, GaugeOrdinal},
};

/// The declared decision-5 unit law: what one estimand unit is, over the admitted attraction
/// instances.
///
/// The unit of account is domain identity - decision 5's open row - and d6 fixes only the
/// factorization conditional on the declaration. The trainer therefore consumes the law as a
/// declared input and conditions every population derivation on it, closing nothing the
/// ledger keeps open: a ruling adds a variant here and its derivations at the match arms the
/// compiler names.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum UnitLaw {
    /// One unit per admitted force-bearing link instance, weighted by the released census
    /// factors - the released pipeline's own unit of account.
    PerLinkInstance,
}

/// One declared unit of the target estimand, drawn into a batch.
///
/// The endpoint rows speak the coordinate domain the term evaluates against. The ruler is the
/// pair's frozen band-reference scale, gathered from the frozen table before re-indexing. The
/// weight is the unit's declared mass, aggregated over the unit's instances as decision 5
/// declares. The inclusion probability is the draw law's full first-order probability for this
/// unit, the divisor that makes the batch sum unbiased.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct TargetUnit<N> {
    /// The unit's source row.
    pub source: N,
    /// The unit's target row.
    pub target: N,
    /// The pair's frozen ruler `σ₀(e)`.
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
/// distinct edges uniformly without replacement inside each chosen type, so every drawn unit
/// appears exactly once and the deduplicated-set estimator form applies. Under that law a unit's
/// full first-order inclusion probability factors into the group's selection probability times
/// the within-group selection probability, and [`CappedDrawLaw::inclusion`] evaluates exactly
/// that product.
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
    /// so a violation is a wiring defect.
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
    /// than the cap contributes all its edges when selected, so its within-group factor is one.
    #[expect(
        clippy::cast_precision_loss,
        reason = "group counts stay far below f64's exact-integer range for ratio purposes"
    )]
    #[must_use]
    pub(crate) fn inclusion(&self, group_size: NonZero<usize>) -> PositiveUnitFraction {
        let group = self.drawn.get() as f64 / self.total.get() as f64;
        let within = self.cap.get().min(group_size.get()) as f64 / group_size.get() as f64;

        // In domain with no check: each ratio is a positive quotient of a positive numerator
        // by a bound at least as large, so both round inside (0, 1] and their product cannot
        // cross either endpoint.
        PositiveUnitFraction::new_unchecked(group * within)
    }
}

/// One batch evaluation's reading.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct TargetReading {
    /// The estimand estimate `L̂`, never scaled by the activation.
    ///
    /// The reading stays live at zero activation, so a reference replicate still reads what the
    /// target term would score. The composite objective's value contribution is the activation
    /// times this reading. The domain is signed: under the [`Penalty::Identity`] shape a
    /// satisfied unit's negative violation subtracts value.
    pub estimand: Finite,
    /// The accumulated pull on the fitted scale, activation-scaled like the gradient fields.
    ///
    /// Non-negative by construction: the force and the fitted-scale slope both are, so every
    /// accumulated term is. [`fan_scale_pull`] carries it into the gauge anchors' coordinates.
    pub scale_pull: DNonNegative,
}

/// The batch estimator's evaluation constants.
///
/// One instance holds what stays fixed across the units of one evaluation. The energy carries
/// the fitted scale and the margin, the penalty is the declared `φ`, the population weight is
/// the split-time total `W`, and the activation is the treatment coefficient `λ`.
///
/// The population weight's domain is strictly positive because an empty population resolves into
/// the vacuous-record taxonomy at split time, before any fit exists to evaluate. The division by
/// `W` is therefore total here by construction of the caller's split, not by a runtime guard.
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
    /// implementation, finite at every finite violation by construction. Its choice is decision
    /// 4's, and the ruled subgradient keeps corrective force at a zero violation unless a
    /// positive margin already makes distance equality a nonzero violation, which admission
    /// enforces against the declared pair.
    ///
    /// A coincident endpoint pair on either side has no direction on that side, so that side
    /// folds a zero contribution while the value still counts, matching the violation core's
    /// contract. A canonical coincidence also reads a zero scale slope, so no pull arrives from
    /// it either.
    ///
    /// # Panics
    ///
    /// This panics when the canonical and zero fields cover different row counts, or when a unit
    /// references a row outside them. Fields, units, and coordinates come from one batch assembly
    /// over one forward pass, so a mismatch is a wiring defect.
    pub(crate) fn evaluate<N>(
        &self,
        canonical: &IdSlice<N, Vec2>,
        zero: &IdSlice<N, Vec2>,
        units: &[TargetUnit<N>],
        canonical_field: &mut GradientField<N>,
        zero_field: &mut GradientField<N>,
    ) -> TargetReading
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

        // Accumulated in double precision, products included.
        let mut estimand = DFinite::ZERO;
        let mut scale_pull = DNonNegative::ZERO;

        for unit in units {
            let (source, target) = (unit.source, unit.target);
            let canonical_difference = canonical[source] - canonical[target];
            let zero_difference = zero[source] - zero[target];
            let canonical_distance = canonical_difference.length();
            let zero_distance = zero_difference.length();

            let evaluation = self
                .energy
                .evaluate(unit.ruler, canonical_distance, zero_distance);
            let (value, slope) = self.penalty.evaluate(f64::from(evaluation.violation));

            // The unit's estimator mass w(e)/(W·π(e)). The inclusion divisor is total by type.
            let mass = unit.weight / (denominator * unit.inclusion);
            estimand = DFinite::from(mass).mul_add(value, estimand);

            let force = activation * mass * slope;
            scale_pull = force.mul_add(evaluation.fitted_scale_slope.widen(), scale_pull);

            if let Some(distance) = canonical_distance.positive() {
                // dv/dy_source = canonical_slope · (y_source - y_target)/d_c.
                let gradient = DVec2::from(canonical_difference)
                    * (force * evaluation.canonical_slope.widen() / distance.widen()).get();
                canonical_field.add(source, gradient);
                canonical_field.add(target, -gradient);
            }

            if let Some(distance) = zero_distance.positive() {
                // dv/dy_source = zero_slope · (y_source - y_target)/d₀, the honest reward for
                // inflating a zero distance, held by the band projection and never hidden.
                let gradient = DVec2::from(zero_difference)
                    * (force * f64::from(evaluation.zero_slope) / distance.widen());
                zero_field.add(source, gradient);
                zero_field.add(target, -gradient);
            }
        }

        TargetReading {
            estimand: estimand.narrow_lossy(),
            scale_pull,
        }
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
/// anchor row lies outside a field. The rows and the fit come from one gauge, so a mismatch is a
/// wiring defect.
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
