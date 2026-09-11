//! The gauge alignment is the live similarity the estimand reads canonical distances through.
//!
//! The contrast compares distances in the zero-condition frame. The zero side is read directly,
//! and the canonical side is read through a similarity fitted over the gauge anchors - rows drawn
//! disjoint from movement participants, held-out pair endpoints, and matched controls, so the
//! optimizer cannot own the frame it is measured in. Rotation and translation cancel in pair
//! distances, which concentrates the whole alignment in the fitted scale `s`. The fit is live:
//! `s` carries a derivative into both fields' anchor coordinates, and hiding either path would
//! misstate the gradient the same way a detached ruler does. This module owns the fit, the four
//! fit rules, and the exact adjoints of `s`.
//!
//! With centred anchors `u(g) = x_c(g) − x̄_c` and `v(g) = x₀(g) − x̄₀`, the closed-form fit
//! reads `s = √(a² + b²)/D` from `a = Σ u·v`, `b = Σ u⊥·v`, `D = Σ‖u‖²`, and the rotation `R`
//! from the angle of `(a, b)`. Differentiating through `a`, `b`, and `D` gives the two adjoint
//! fields, evaluated per anchor at the fitted optimum:
//!
//! - canonical: `∂s/∂x_c(g) = (Rᵀ·v(g) − 2s·u(g)) / D`
//! - zero: `∂s/∂x₀(g) = (R·u(g)) / D`
//!
//! Centring makes each raw-coordinate derivative the centred one minus the mean of all centred
//! derivatives, and both means vanish over centred sums (`Σu = Σv = 0`), so the forms above are
//! exact in the raw coordinates. The tests pin the Euler laws this buys: `Σ u·∂s/∂x_c = −s` and
//! `Σ v·∂s/∂x₀ = +s`, because the scale is degree −1 in the canonical constellation and degree
//! +1 in the zero one. The per-anchor magnitude falls as `1/(|G|·spread)`, which is what makes
//! the gauge channel a reading rather than a lever.
//!
//! Each fit rule is a shape fixed by the derivation with an owner-valued number, and a rule
//! whose number is not yet declared does not bind. The minimum spread (`spread_G/band ≥ κ`) and
//! the minimum effective count (the Kish form over anchors deduplicated by duplicate class) bind
//! at the freeze. The maximum normalized residual binds at every fit. Any degeneracy - the
//! closed form's own refusals or a residual above its bar - lands in the one refusal class,
//! [`GaugeRefusal`], whose outcome is fixed: publish no activation candidate and record the
//! failed reading. The fit always runs on all of the anchors, never a subsample, because the
//! estimator's contract needs `s` to be a function of the fields alone.

mod refusal;
#[cfg(test)]
mod tests;

use hashql_core::id::{Id, IdSlice, IdVec};
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

pub(crate) use self::refusal::GaugeRefusal;
use crate::math::{DNonNegative, DPositive, DVec2, FinitePointField, Positive, Similarity};

hashql_core::id::newtype! {
    /// One anchor's position in the gauge population, in draw order.
    #[id(const)]
    pub(crate) struct GaugeOrdinal(u32)
}

hashql_core::id::newtype! {
    /// The split's duplicate-class covariate, under which byte-identical embedding rows share
    /// one class.
    ///
    /// The draw machinery assigns the ids. This module consumes them for the effective count,
    /// where duplicates of one class are the same evidence and count once.
    #[id(const)]
    pub(crate) struct DuplicateClassId(u32)
}

/// The band-conditioned minimum-spread rule.
///
/// Present when the replicate-band artifact exists. A frame whose defining spread is commensurate
/// with the band has noise-owned units, so the anchors' frozen spread must satisfy
/// `spread_G / band ≥ κ`.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SpreadFloor {
    /// `κ`: the owner's spread factor. Its value is an open owner decision. Its role is not.
    pub kappa: Positive,
    /// The constraint radius in world units: the same-frame reconstruction `β_proj · s_ref`.
    pub band: Positive,
}

/// The frozen gauge population holds the anchor rows with their duplicate classes beside the
/// frozen spread and the effective count.
#[derive(Debug, PartialEq)]
pub(crate) struct GaugeAnchors<N> {
    /// The anchor rows in draw order.
    rows: Box<IdSlice<GaugeOrdinal, N>>,
    /// Each anchor's duplicate class, aligned with `rows`.
    classes: Box<IdSlice<GaugeOrdinal, DuplicateClassId>>,
    /// `spread_G(Z_K)`: the anchors' centred RMS spread in the boundary snapshot, the frozen
    /// denominator of every normalized residual and the minimum-spread rule's reading.
    frozen_spread: Positive,
    /// `n_eff_G`: the Kish effective count over anchors deduplicated by duplicate class. With
    /// equal per-anchor weights this is the distinct class count, and a stratified-weighted
    /// draw would supply its own weights.
    effective_count: DNonNegative,
}

impl<N> GaugeAnchors<N>
where
    N: Id,
{
    /// Freezes the gauge population against the boundary snapshot.
    ///
    /// Reads the anchors' spread on the boundary snapshot's gauge rows and the effective count
    /// over duplicate classes, then validates the freeze-time rules whose numbers are declared.
    /// A rule without a declared number does not bind.
    ///
    /// The rows and classes come from one draw and every anchor row lies in the snapshot's
    /// domain - wiring contracts, the length half checked in debug builds and the domain half
    /// at the gather's indexing.
    ///
    /// # Errors
    ///
    /// Returns [`GaugeRefusal`] carrying the first failed reading: fewer than two anchors, a
    /// degenerate frozen spread, a spread below the declared band floor, or an effective count
    /// below the declared minimum.
    ///
    /// # Panics
    ///
    /// This panics at the gather when an anchor row lies outside the snapshot's row domain.
    pub(crate) fn freeze(
        rows: Box<[N]>,
        classes: Box<[DuplicateClassId]>,
        zero_snapshot: &FinitePointField<N>,
        spread_floor: Option<SpreadFloor>,
        minimum_effective: Option<Positive>,
    ) -> Result<Self, GaugeRefusal> {
        debug_assert_eq!(
            rows.len(),
            classes.len(),
            "anchor rows and duplicate classes should come from one draw"
        );

        if rows.len() < 2 {
            return Err(GaugeRefusal::InsufficientAnchors { count: rows.len() });
        }

        let constellation = zero_snapshot.gather(IdSlice::<GaugeOrdinal, _>::from_raw(&rows));
        let spread = constellation.rms_spread();

        #[expect(
            clippy::cast_possible_truncation,
            reason = "the frozen constant lives in the working f32 precision; the domain check \
                      reads the narrowed value"
        )]
        let frozen_spread =
            Positive::new(spread as f32).ok_or(GaugeRefusal::DegenerateSpread { spread })?;

        if let Some(floor) = spread_floor {
            let ratio = frozen_spread.div_wide(floor.band);
            if ratio < DPositive::from(floor.kappa) {
                return Err(GaugeRefusal::SpreadBelowFloor {
                    ratio,
                    kappa: floor.kappa,
                });
            }
        }

        let effective_count = kish_effective_count(&classes);
        if let Some(minimum) = minimum_effective
            && effective_count < DNonNegative::from(minimum)
        {
            return Err(GaugeRefusal::UndersizedEffectiveCount {
                effective: effective_count,
                minimum,
            });
        }

        Ok(Self {
            rows: IdSlice::from_boxed_slice(rows),
            classes: IdSlice::from_boxed_slice(classes),
            frozen_spread,
            effective_count,
        })
    }

    /// Fits the alignment over pre-gathered anchor constellations in draw order.
    ///
    /// The trainer's per-step evaluation holds the anchors' coordinates in a batch-local frame
    /// rather than in whole-corpus fields, so this entry takes the two constellations already
    /// gathered - `source` the anchors' canonical coordinates and `target` their zero-frame
    /// coordinates, both in draw order.
    ///
    /// Both constellations cover the anchor draw - a wiring contract checked in debug builds,
    /// since the gather and the frozen draw come from one gauge.
    ///
    /// # Errors
    ///
    /// Returns [`GaugeRefusal`] carrying the first failed reading.
    pub(crate) fn fit_gathered(
        &self,
        source: &FinitePointField<GaugeOrdinal>,
        target: &FinitePointField<GaugeOrdinal>,
        residual_bar: Option<Positive>,
    ) -> Result<GaugeFit, GaugeRefusal> {
        debug_assert_eq!(
            source.len(),
            self.rows.len(),
            "the canonical constellation should cover the anchor draw"
        );
        debug_assert_eq!(
            target.len(),
            self.rows.len(),
            "the zero constellation should cover the anchor draw"
        );

        let similarity =
            Similarity::fit_uniform_par(source, target).ok_or(GaugeRefusal::FitRefused)?;
        let scale = similarity.scale();

        let rms = similarity.rms_residual_par(source, target);

        // Total: the rms residual stays below ~1.2e87 by its own totality theorem, and the
        // smallest positive f32 spread is 2⁻¹⁴⁹, keeping the quotient far inside the domain.
        let residual = (rms / self.frozen_spread.widen()).finish_unchecked();
        if let Some(bar) = residual_bar
            && residual > DPositive::from(bar)
        {
            return Err(GaugeRefusal::ResidualAboveBar { residual, bar });
        }

        let (canonical_adjoints, zero_adjoints) = adjoints(source, target, similarity, scale)?;

        Ok(GaugeFit {
            similarity,
            scale,
            residual,
            canonical_adjoints,
            zero_adjoints,
        })
    }

    /// Borrows the anchor rows in draw order.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> &IdSlice<GaugeOrdinal, N> {
        &self.rows
    }

    /// Returns `spread_G(Z_K)`, the anchors' frozen centred RMS spread.
    #[inline]
    #[must_use]
    pub(crate) const fn frozen_spread(&self) -> Positive {
        self.frozen_spread
    }

    /// Returns `n_eff_G`, the effective anchor count over duplicate classes.
    #[inline]
    #[must_use]
    pub(crate) const fn effective_count(&self) -> DNonNegative {
        self.effective_count
    }
}

/// One evaluation's fitted alignment carries the similarity and its scale beside the normalized
/// residual and the scale's exact adjoints into both fields' anchor coordinates.
#[derive(Debug, PartialEq)]
pub(crate) struct GaugeFit {
    /// The fitted similarity, canonical onto zero: the evidence bridge between frames.
    similarity: Similarity,
    /// The fitted scale `s`, the one live alignment quantity pair distances consume.
    scale: Positive,
    /// `RMS(S(x_c(g)) − x₀(g)) / spread_G(Z_K)`: the non-similarity deformation of the gauge
    /// constellation, recorded at every fit and bounded by the bar when one is declared.
    residual: DNonNegative,
    /// `∂s/∂x_c(g)` per anchor: the adjoint that fans the objective's pull on `s` into the
    /// canonical anchor coordinates.
    canonical_adjoints: Box<FinitePointField<GaugeOrdinal>>,
    /// `∂s/∂x₀(g)` per anchor: the zero-field twin, present for the same reason the contrast's
    /// zero slope is - hiding a real path would misstate the derivative.
    zero_adjoints: Box<FinitePointField<GaugeOrdinal>>,
}

impl GaugeFit {
    /// Returns the fitted scale `s`.
    #[inline]
    #[must_use]
    pub(crate) const fn scale(&self) -> Positive {
        self.scale
    }

    /// Returns the normalized residual against the frozen spread.
    #[inline]
    #[must_use]
    pub(crate) const fn residual(&self) -> DNonNegative {
        self.residual
    }

    /// Borrows `∂s/∂x_c(g)` in draw order.
    #[inline]
    #[must_use]
    pub(crate) fn canonical_adjoints(&self) -> &FinitePointField<GaugeOrdinal> {
        &self.canonical_adjoints
    }

    /// Borrows `∂s/∂x₀(g)` in draw order.
    #[inline]
    #[must_use]
    pub(crate) fn zero_adjoints(&self) -> &FinitePointField<GaugeOrdinal> {
        &self.zero_adjoints
    }
}

/// The per-anchor adjoint fields, canonical beside zero, in draw order.
type AdjointFields = (
    Box<FinitePointField<GaugeOrdinal>>,
    Box<FinitePointField<GaugeOrdinal>>,
);

/// Evaluates both adjoint fields at the fitted optimum, per anchor in parallel.
///
/// The rotation and scale re-widen from the fitted f32 coefficients, so the adjoints
/// differentiate the alignment the forward pass actually uses. `D` re-accumulates in f64 through
/// the deterministic chunked reduction.
fn adjoints(
    source: &FinitePointField<GaugeOrdinal>,
    target: &FinitePointField<GaugeOrdinal>,
    similarity: Similarity,
    scale: Positive,
) -> Result<AdjointFields, GaugeRefusal> {
    // The fields carry the finiteness proof, so the statistics evaluate with no scan.
    let source_centre = source.centroid();
    let target_centre = target.centroid();

    let variance = source.squared_deviation_sum(source_centre);

    let cos = f64::from(similarity.rotation().cos());
    let sin = f64::from(similarity.rotation().sin());
    let scale = f64::from(scale);

    // A parallel collect into `Result` short-circuits on the first refusal, and the tuple
    // target unzips the accepted pairs in one pass.
    let (canonical_adjoints, zero_adjoints): (IdVec<_, _>, IdVec<_, _>) = (0..source.len())
        .into_par_iter()
        .map(|index| {
            let ordinal = GaugeOrdinal::from_usize(index);

            let centred_source = DVec2::from(source[ordinal]) - source_centre;
            let centred_target = DVec2::from(target[ordinal]) - target_centre;

            // canonical: (Rᵀ·v − 2s·u)/D, zero: (R·u)/D.
            let canonical = DVec2::new(
                (2.0 * scale).mul_add(
                    -centred_source.x(),
                    cos.mul_add(centred_target.x(), sin * centred_target.y()),
                ) / variance,
                (2.0 * scale).mul_add(
                    -centred_source.y(),
                    cos.mul_add(centred_target.y(), -sin * centred_target.x()),
                ) / variance,
            );
            let zero = DVec2::new(
                cos.mul_add(centred_source.x(), -sin * centred_source.y()) / variance,
                cos.mul_add(centred_source.y(), sin * centred_source.x()) / variance,
            );

            let canonical = canonical.narrow();
            let zero = zero.narrow();

            Option::zip(canonical, zero).ok_or(GaugeRefusal::NonFiniteAdjoint { ordinal })
        })
        .collect::<Result<_, _>>()?;

    Ok((
        FinitePointField::new_boxed_unchecked(canonical_adjoints.into_boxed_slice()),
        FinitePointField::new_boxed_unchecked(zero_adjoints.into_boxed_slice()),
    ))
}

/// Returns the Kish effective count over anchors deduplicated by duplicate class.
///
/// With equal per-anchor weights the Kish form reduces to the distinct class count: duplicates
/// of one class are the same evidence and count once. A stratified-weighted draw would supply
/// per-class weights and the general form.
fn kish_effective_count(classes: &[DuplicateClassId]) -> DNonNegative {
    let mut sorted: Vec<_> = classes.to_vec();
    sorted.sort_unstable();
    sorted.dedup();

    DNonNegative::from_usize(sorted.len())
}
