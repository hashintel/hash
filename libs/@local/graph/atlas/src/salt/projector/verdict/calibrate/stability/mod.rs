//! An evaluated minimum-mass stability bound for the reviews arm's frozen radius.
//!
//! The certificate's one stochastic claim is a false-pass bound:
//!
//! ```text
//! Pr[ PASS ∧ |û_q − u| > τ ] ≤ δ
//! ```
//!
//! where `û_q` is the frozen radius (the weighted `q`-quantile of the measured `z` population),
//! `u` is the latent weighted-population quantile the estimator addresses, `τ = κ·T` the
//! materiality tolerance, and `δ` the false-pass budget. The bound holds conditional on the
//! independence licence: pair draws independent with fixed weights. The sentence is not
//! `Pr(correct | pass) ≥ 1 − δ`, because the conditional claim needs a marginal over the latent
//! distribution that nothing here supplies. It also makes no claim about the latent band's
//! width: an atom inside the band boundary collapses the empirical gap while the latent gap
//! stays arbitrary. For a consumer, a pass certifies the recorded radius lies within one
//! temperature of the latent weighted-population quantile except on a δ-probability event -
//! inside the sigmoid's own blur, which is the statement the Proximal energy needs.
//!
//! The decision is the direct predicate, authoritative in code exactly as written:
//!
//! ```text
//! PASS  ⟺  ε₀ ≤ q  ∧  G(ε₀) ≤ τ,      ε₀ = √(ln(2/δ) / (2·n_eff))
//! ```
//!
//! with `G(ε) = Q̂(q+ε) − Q̂(q−ε)` the empirical interval width and
//! `n_eff = (Σw)² / Σw²` the effective support of the weighted population. The theorem behind
//! it: the observed interval `[Q̂(q−ε), Q̂(q+ε)]` covers the latent `u` with probability at
//! least `1 − 2·exp(−2ε²·n_eff)`, the lower event through the positive-mass minimum at the
//! `ε = q` boundary (which is what makes the floor inclusive) and the upper event through the
//! fixed strict-threshold variables at `u−`. A pass therefore needs
//! `n_eff ≥ ln(2/δ)/(2q²)` - the legibility floor - before the gap is even consulted. A
//! hundred low-weight pairs therefore never outrank ten balanced ones by count alone.
//!
//! `ε*`, `n*`, and the attained bit are derived after the decision and persist as evidence for
//! readers: `ε* = sup{ε ∈ (0, q] : G(ε) ≤ τ}`, `n* = ln(2/δ)/(2·ε*²)`, and
//! `attained := G(ε*) ≤ τ` decided by evaluating `G` at `ε*` exactly. The safe set is an
//! interval anchored at zero - either empty (no finite bound exists), `(0, ε*)`, or `(0, ε*]` -
//! and the sup does not decide its own membership, which is why the finite bound carries the
//! strictness bit: `PASS ⟺ n_eff ≥ n*` when attained and `n_eff > n*` when not.
//!
//! The empirical support is the positive-mass rows. Zero-weight rows are excluded from every
//! reading here, from the sorted walk through the two clamps (level zero reads the
//! positive-mass minimum and level one the maximum) to the breakpoint enumeration and the
//! width `G` they induce. Quantiles follow the production
//! walk's semantics - ascending by `z`, `f64` cumulative mass, first row whose cumulative
//! reaches the threshold. The certificate and the frozen radius therefore read one population
//! the same way.
//!
//! The certificate persists the generation's frozen `T` because the evaluated population and
//! result belong to that generation, not because `T` has fitted-frame units. `z`, and with it
//! `G`, `T`, and `τ`, are dimensionless.

#[cfg(test)]
mod tests;

use crate::math::{DNonNegative, DPositive, Derivation, NonNegative, OpenUnitFraction};

/// The false-pass budget `δ`.
///
/// The certified event `PASS ∧ |û_q − u| > τ` has probability at most this value under the
/// independence licence. At `0.05` the legibility floor `ln(2/δ)/(2q²)` is `29.51` effective
/// pairs. A tighter `0.01` would raise it to `42.39`.
const FALSE_PASS_BUDGET: OpenUnitFraction =
    OpenUnitFraction::new(0.05).expect("0.05 lies inside (0, 1)");

/// The materiality multiplier `κ` in `τ = κ·T`.
///
/// A radius error inside the sigmoid transition's own width does not change what the Proximal
/// energy does to a pair, so one temperature is the materiality unit.
const MATERIALITY_MULTIPLIER: DPositive =
    DPositive::new(1.0).expect("the materiality unit is positive");

/// The evaluated stability bound `n*`, or the record that none exists.
///
/// The bound has three meanings and two encodings. An absent certificate is a document written
/// without one. A present certificate either evaluated a finite bound or found that none
/// exists. This enum holds the last two, and absence never impersonates a value.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum StabilityBound {
    /// The evaluated minimum effective support `n* = ln(2/δ)/(2·ε*²)`.
    Finite {
        /// The bound's value.
        support: DPositive,
        /// Whether `ε*` itself satisfies `G(ε*) ≤ τ`.
        ///
        /// The pass equivalence is exact only with this bit: `PASS ⟺ n_eff ≥ n*` when
        /// attained, `n_eff > n*` when not. The decision itself never consults it, because the
        /// direct predicate is authoritative. The bit exists for readers replaying the
        /// comparison.
        attained: bool,
    },
    /// The safe set is empty because a local cliff wider than `τ` defeats any amount of mass.
    Unattainable,
}

/// The reviews arm's evaluated certificate, persisted beside the boundary calibration.
///
/// Every constant the decision consumed rides in the record, so the artifact names its own
/// regime and a future compatible arm evaluates fresh rather than copying a scalar.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct StabilityCertificate {
    /// The quantile level `q` the estimator freezes at.
    pub quantile: OpenUnitFraction,
    /// The false-pass budget `δ`.
    pub delta: OpenUnitFraction,
    /// The materiality multiplier `κ`.
    pub kappa: DPositive,
    /// The generation's frozen transition temperature `T`.
    pub temperature: DPositive,
    /// The materiality tolerance `τ = κ·T`.
    pub tau: DPositive,
    /// The effective support `(Σw)² / Σw²` of the positive-mass population - the derivation's
    /// `n_eff`.
    pub effective_support: DPositive,
    /// The raw pair count, reader context only: the decision never consults it.
    pub pairs: usize,
    /// The total pair mass `W`.
    pub mass: DNonNegative,
    /// The evaluated deviation level `ε₀ = √(ln(2/δ) / (2·n_eff))`.
    pub epsilon_zero: DPositive,
    /// The empirical interval width `G(ε₀) = Q̂(q+ε₀) − Q̂(q−ε₀)`, clamped-endpoint semantics.
    ///
    /// Past the floor (`ε₀ > q`) the lower level clamps at the positive-mass minimum, so the
    /// reading degrades toward the population's full width rather than vanishing; the decision
    /// has already failed on the floor conjunct there.
    pub gap: DNonNegative,
    /// The evaluated bound, or the record that none exists.
    pub bound: StabilityBound,
    /// The decision of the direct predicate `ε₀ ≤ q ∧ G(ε₀) ≤ τ`.
    pub pass: bool,
    /// The type-level effective support `(ΣM_t)² / ΣM_t²` over per-type masses.
    ///
    /// Evidence only, never checked: one resolving verdict reads `1.0`, maximally thin, visible
    /// to any reader. Within-type correlation makes the pair-level `n_eff` optimistic, and this
    /// number is what shows it.
    pub type_effective_support: DPositive,
}

/// The positive-mass population in production walk order, with its prefix cumulative masses.
///
/// `Q̂` reads as the first row whose cumulative mass reaches the level's threshold - the same
/// first-crossing the production quantile walk takes, resolved by binary search over the strictly
/// increasing prefix sums instead of a linear pass. Strict positivity of every retained weight is
/// what makes the prefix strictly increasing, and with it the two resolutions identical.
struct Support {
    /// The `z` values, ascending.
    values: Vec<NonNegative>,
    /// `cumulative[k]` is the mass of rows `0..=k`.
    cumulative: Vec<f64>,
}

impl Support {
    /// Retains the positive-mass rows of an ascending population.
    fn new(sorted: impl IntoIterator<Item = (NonNegative, DNonNegative)>) -> Self {
        let mut values = Vec::new();
        let mut cumulative = Vec::new();
        let mut mass = Derivation::<DNonNegative>::ZERO;
        for (z, weight) in sorted {
            if weight > 0.0 {
                mass += weight;
                values.push(z);
                cumulative.push(mass.into_raw());
            }
        }

        Self { values, cumulative }
    }

    /// The total positive mass `W`.
    const fn mass(&self) -> f64 {
        self.cumulative.last().copied().unwrap_or(0.0)
    }

    /// The quantile at `level`, with the clamped-endpoint convention.
    ///
    /// Levels at or below zero read the positive-mass minimum and levels at or above one the
    /// positive-mass maximum; between them the production walk's first crossing of
    /// `level · W` decides.
    fn quantile(&self, level: f64) -> NonNegative {
        if level <= 0.0 {
            return self.values[0];
        }
        if level >= 1.0 {
            return self.values[self.values.len() - 1];
        }

        let threshold = level * self.mass();
        let position = self
            .cumulative
            .partition_point(|&cumulative| cumulative < threshold);
        // Cumulative rounding can shave the last prefix below `level · W` for levels near one;
        // the walk's answer is the maximum either way.
        self.values[position.min(self.values.len() - 1)]
    }

    /// The empirical interval width `G(ε) = Q̂(q+ε) − Q̂(q−ε)`.
    fn gap(&self, level: f64, epsilon: f64) -> DNonNegative {
        // The first-crossing quantile is nondecreasing in its level - the threshold is monotone
        // in the level, `partition_point` is monotone in the threshold, and the values ascend,
        // therefore the width is non-negative and the absolute value is exact on it.
        (self.quantile(level + epsilon).widen() - self.quantile(level - epsilon).widen()).abs()
    }

    /// The effective support `(Σw)² / Σw²`, computed on normalized weights.
    ///
    /// Normalizing by `W` first keeps the squares away from underflow: `Σp²` is at least the
    /// reciprocal of the row count.
    ///
    /// # Panics
    ///
    /// This panics when every normalized share rounds to zero, which requires a population
    /// whose leading weights are denormal against its total. Such a population is a defect of
    /// the weights, and refusing it here names the reading it would have corrupted.
    fn effective(&self) -> DPositive {
        let mass = self.mass();
        let mut previous = 0.0_f64;
        let mut squares = 0.0_f64;
        for &cumulative in &self.cumulative {
            let share = (cumulative - previous) / mass;
            squares = share.mul_add(share, squares);
            previous = cumulative;
        }
        DPositive::new(1.0 / squares)
            .expect("a positive-mass population has a positive, finite effective support")
    }
}

/// Evaluates the reviews arm's stability certificate over the boundary's pooled population.
///
/// `sorted` is the calibration's pooled `(z, weight)` population, ascending by `z` in the same
/// order the frozen radius walked, `type_masses` the per-type total masses, `pairs` the raw pair
/// count, and `temperature` the generation's frozen `T`. Zero-weight rows and zero-mass types
/// are excluded here, so callers pass their populations unfiltered.
///
/// # Panics
///
/// This panics when no row carries positive mass. The caller evaluates the certificate exactly
/// when the boundary froze a measured radius, which requires positive mass, so an empty support
/// is a wiring defect.
pub(crate) fn evaluate(
    sorted: impl IntoIterator<Item = (NonNegative, DNonNegative)>,
    type_masses: impl IntoIterator<Item = DNonNegative>,
    pairs: usize,
    temperature: DPositive,
) -> StabilityCertificate {
    let support = Support::new(sorted);
    assert!(
        !support.values.is_empty(),
        "a measured radius implies a positive-mass population"
    );

    let quantile = super::RADIUS_FRACTION;
    let tau = MATERIALITY_MULTIPLIER * temperature;
    let confidence = (2.0 / FALSE_PASS_BUDGET).ln();

    let effective_support = support.effective();
    // In domain with no check: the confidence is a positive constant and the effective support
    // a validated positive, so the quotient stays positive - a reciprocal of a finite value
    // never rounds to zero - and the square root of a positive value is positive.
    let epsilon_zero = DPositive::new_unchecked((confidence / (2.0 * effective_support)).sqrt());
    let gap = support.gap(quantile.get(), epsilon_zero.get());
    let pass = epsilon_zero <= quantile && gap <= tau;

    let bound = match safe_supremum(&support, quantile.get(), tau.get()) {
        Some((epsilon, attained)) => StabilityBound::Finite {
            support: DPositive::new(confidence / (2.0 * epsilon * epsilon)).expect(
                "a deviation level so small its square underflows requires two prefix-mass \
                 fractions closer than a denormal, which is a defect of the weights",
            ),
            attained,
        },
        None => StabilityBound::Unattainable,
    };

    let type_effective_support = {
        let mut total = Derivation::<DNonNegative>::ZERO;
        let mut squares = Derivation::<DNonNegative>::ZERO;
        for mass in type_masses {
            if mass > 0.0 {
                total += mass;
                squares += Derivation::from(mass) * mass;
            }
        }
        let total = total.into_raw();
        DPositive::new(total * total / squares.into_raw())
            .expect("a measured boundary carries at least one positive type mass")
    };

    StabilityCertificate {
        quantile,
        delta: FALSE_PASS_BUDGET,
        kappa: MATERIALITY_MULTIPLIER,
        temperature,
        tau,
        effective_support,
        pairs,
        mass: DNonNegative::new(support.mass())
            .expect("a population whose total mass overflows is a defect of the weights"),
        epsilon_zero,
        gap,
        bound,
        pass,
        type_effective_support,
    }
}

/// Resolves `ε* = sup{ε ∈ (0, q] : G(ε) ≤ τ}` and whether the sup is attained.
///
/// Returns [`None`] when the safe set is empty.
///
/// `G` is a nondecreasing step function of `ε` whose value can change only where `q − ε` or
/// `q + ε` crosses a prefix-mass fraction, so the candidates are those crossings plus the domain
/// endpoint `q`. Between consecutive candidates `G` is constant, and each candidate is evaluated
/// exactly by the same walk that evaluates `G(ε₀)` - the sup and its membership bit come from
/// evaluation, never from continuity reasoning.
fn safe_supremum(support: &Support, level: f64, tau: f64) -> Option<(f64, bool)> {
    let mass = support.mass();
    let mut candidates: Vec<f64> = Vec::with_capacity(2 * support.cumulative.len() + 1);
    for &cumulative in &support.cumulative {
        let fraction = cumulative / mass;
        let below = level - fraction;
        if below > 0.0 && below <= level {
            candidates.push(below);
        }
        let above = fraction - level;
        if above > 0.0 && above <= level {
            candidates.push(above);
        }
    }
    candidates.push(level);
    candidates.sort_unstable_by(f64::total_cmp);
    candidates.dedup();

    // Segments are `(previous, candidate]`. The interior value is read at the midpoint (any
    // interior point carries the segment's constant) and the endpoint value at the candidate
    // itself. A segment too narrow to hold an interior `f64` has no interior to ask about.
    let mut previous = 0.0_f64;
    let mut supremum = None;
    for &candidate in &candidates {
        let midpoint = f64::midpoint(previous, candidate);
        if midpoint > previous && midpoint < candidate && support.gap(level, midpoint) > tau {
            // The interior already exceeds τ: the safe set ends at the previous candidate,
            // which passed its endpoint evaluation to get here.
            return supremum;
        }

        if support.gap(level, candidate) > tau {
            // The interior passes and the endpoint fails: the safe set is the open interval,
            // its sup is this candidate, and the sup is not attained.
            return Some((candidate, false));
        }

        supremum = Some((candidate, true));
        previous = candidate;
    }

    supremum
}
