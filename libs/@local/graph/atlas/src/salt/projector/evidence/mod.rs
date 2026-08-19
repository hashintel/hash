//! The per-evaluation evidence the target objective must emit.
//!
//! The estimand reads through frozen references, so every published claim about a fit rests on
//! readings that let a later audit rebuild the frame arithmetic. Each evaluation assembles one
//! [`EvaluationEvidence`]. The record holds the live alignment beside the
//! reference-configuration pair `s_K`/`r_K` - the same closed-form fit with the boundary
//! snapshot `Z_K` in the zero slot. The whole-corpus alignment rides beside them, since its
//! composition with the gauge fit is the frame bridge, and the zero-field common-mode
//! similarity onto `Z_K` reads the uniform mode the per-row band admits. The affine component
//! on the gauge population follows with its normalized residual. The gauge displacement
//! distribution keeps the control evidence's exact shape per covariate stratum. The saturation
//! tally counts per stratum, and the enforcement record's summary closes the record. The
//! trainer accumulates the records across evaluations. Drift of the fitted `s` under a static
//! corpus is the alignment channel's signature, and it is readable exactly because the sequence
//! survives.
//!
//! The generation-level constants ride once in a [`RulerIdentity`], so every reading stays
//! reproducible against the exact ruler that produced it. Everything here is aggregate, and no
//! pair or row identity persists in any record.

#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;
use core::{error::Error, fmt};

use hashql_core::id::{Id, IdSlice};

use super::{
    band::{BandProjection, EnforcementRecord},
    gauge::{GaugeAnchors, GaugeFit, GaugeOrdinal},
};
use crate::{
    math::{DFinite, DNonNegative, DVec2, FinitePointField, Positive, Similarity, Transform},
    salt::ladder::paired::MovementAggregate,
};

hashql_core::id::newtype! {
    /// The split rule's covariate stratum of one node row.
    ///
    /// A stratum is one cell of the partition the versioned split rule draws over the declared
    /// covariate classes - density, degree, and whatever else the rule declares. Rows in one
    /// stratum are therefore comparable under the rule's own matching. The draw machinery
    /// assigns the ids when it partitions the corpus, and this module consumes them as opaque
    /// group labels for the per-stratum families.
    #[id(const)]
    pub(crate) struct StratumId(u32)
}

/// A refused evidence reading names the fit that could not be made.
///
/// Every variant leaves the evaluation without its declared evidence, and an evaluation that
/// cannot state its evidence publishes nothing. Nothing branches on the variants and there is no
/// partial record.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum EvidenceRefusal {
    /// The whole-corpus alignment fit refused, over coincident canonical rows or an exactly
    /// cancelling covariance. Non-finite coordinates never reach the reading: the readback
    /// boundary refuses them naming the row.
    CorpusAlignment,
    /// The zero-field common-mode fit onto the boundary snapshot refused.
    ZeroCommonMode,
    /// The gauge similarity fit over the whole-field anchor constellations refused.
    Gauge,
    /// The reference-configuration fit of the canonical gauge rows onto the frozen `Z_K`
    /// anchors refused.
    ReferenceConfiguration,
    /// The affine fit over the gauge population refused: the anchors' canonical scatter is
    /// degenerate beyond what the similarity fit tolerates, since an affine solve needs both
    /// axes of its source.
    Affine,
}

impl fmt::Display for EvidenceRefusal {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::CorpusAlignment => fmt.write_str("the whole-corpus alignment fit refused"),
            Self::ZeroCommonMode => {
                fmt.write_str("the zero-field common-mode fit onto the boundary snapshot refused")
            }
            Self::Gauge => {
                fmt.write_str("the gauge fit over the whole-field anchor constellations refused")
            }
            Self::ReferenceConfiguration => fmt
                .write_str("the reference-configuration gauge fit onto the frozen anchors refused"),
            Self::Affine => fmt.write_str("the affine fit over the gauge population refused"),
        }
    }
}

impl Error for EvidenceRefusal {}

/// The declared and measured scalar constants of one ruler freeze.
///
/// The fields are the scalar constants every per-evaluation reading normalizes against, so a
/// reading replayed later resolves against the exact ruler that produced it. The trainer fills
/// the record at the freeze, where each source object is in hand. The boundary field and the
/// ruler's two tables travel beside this record as typed run evidence, and the writer that
/// persists a generation owns their file identity.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RulerIdentity {
    /// The training step the boundary field was taken at.
    pub boundary_step: usize,
    /// `s_ref(Z_K)`: the boundary field's frozen spread, the frame's unit carrier.
    pub reference_spread: Positive,
    /// `spread_G(Z_K)`: the gauge anchors' frozen spread, the denominator of every normalized
    /// residual.
    pub gauge_spread: Positive,
    /// `ε_rel`: the declared dimensionless regularizer.
    pub epsilon_rel: Positive,
    /// `ε_abs = ε_rel · s_ref`: the world-unit regularizer the denominators carry.
    pub epsilon_abs: Positive,
    /// `β_proj`: the declared dimensionless projection radius.
    pub dimensionless_radius: Positive,
    /// `band_proj = β_proj · s_ref(Z_K)`: the enforced world-unit radius, recorded beside its
    /// dimensionless source so the freeze-time domain check stays auditable.
    pub radius: Positive,
}

/// One evaluation's copy of the enforcement record's cumulative readings.
///
/// The record itself accumulates from the boundary through the run's final evaluation with no
/// reset. Copying its scalars at each evaluation turns the running story into a per-evaluation
/// history, which is the form the saturation evidence is consumed in.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct EnforcementSummary {
    /// Whether any row application has ever clipped.
    pub ever_clipped: bool,
    /// The cumulative count of clipped row applications.
    pub clipped_row_applications: u64,
    /// The maximum pre-projection overshoot `(‖d‖ − band)/s_ref`, in units of `s_ref`.
    pub max_overshoot: DNonNegative,
    /// The boundary step the accumulation interval opened at.
    pub opened_at: usize,
    /// The most recent enforcement step, absent before the first application.
    pub last_application: Option<usize>,
}

impl EnforcementSummary {
    /// Copies the record's cumulative readings at the evaluation point.
    #[must_use]
    pub(crate) const fn read<N>(record: &EnforcementRecord<N>) -> Self
    where
        N: Id,
    {
        Self {
            ever_clipped: record.ever_clipped(),
            clipped_row_applications: record.clipped_row_applications(),
            max_overshoot: record.max_overshoot(),
            opened_at: record.opened_at(),
            last_application: record.last_application(),
        }
    }
}

/// The gauge displacement family of one covariate stratum.
///
/// The displacement is each anchor's world-unit zero-field distance from its frozen `Z_K`
/// position. The family keeps the control evidence's exact aggregate shape, so the two collateral
/// readings compare like for like.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct DisplacementStratum {
    /// The stratum the family aggregates over.
    pub stratum: StratumId,
    /// Anchor rows this stratum holds.
    pub anchors: u64,
    /// The displacement aggregate over the stratum's anchors, in draw order.
    pub displacement: MovementAggregate,
}

/// The saturation tally of one covariate stratum.
///
/// A row counts as saturated when its squared zero-field displacement from its projection centre
/// reaches the band's saturation floor. The tally keeps exact integers, and the rate is
/// recorded arithmetic.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SaturationStratum {
    /// The stratum the tally counts over.
    pub stratum: StratumId,
    /// Node rows this stratum holds.
    pub rows: u64,
    /// Rows at the boundary within the band's landing tolerance.
    pub saturated: u64,
}

/// One evaluation's evidence reading over the target objective's frozen references.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct EvaluationEvidence {
    /// The training step the evaluation ran at, ordering the trajectory.
    pub step: usize,
    /// `s`: the gauge-fitted scale over the whole-field realization every bridge end shares.
    pub scale: Positive,
    /// `r`: the whole-field gauge fit's normalized residual against the frozen gauge spread.
    pub residual: DNonNegative,
    /// The objective-shape fitted scale, the `s` the step's estimand actually descended.
    ///
    /// Its forwards run in the pass's own padded shape, which an autotuned backend may realize
    /// differently from the whole fields, so this reading stands alone and bridges nothing.
    pub objective_scale: Positive,
    /// The objective-shape fit's normalized residual.
    pub objective_residual: DNonNegative,
    /// `n_eff_G`: the effective anchor count over duplicate classes.
    pub effective_count: DNonNegative,
    /// The gauge similarity, canonical onto zero over the whole-field realization: one end of
    /// the frame bridge.
    pub gauge_similarity: Similarity,
    /// `s_K`: the scale of the canonical gauge rows fitted onto the frozen `Z_K` anchors, the
    /// gauge-path envelope's first input. The live `s` need not equal it once the zero field
    /// has moved, because the live fit reads current against current and this fit reads
    /// current against frozen.
    pub reference_scale: Positive,
    /// `r_K`: the reference-configuration fit's normalized residual, the envelope's second
    /// input.
    pub reference_residual: DNonNegative,
    /// The whole-corpus similarity, canonical onto zero: the published field's alignment and
    /// the frame bridge's other end.
    pub corpus_similarity: Similarity,
    /// `s_z` with its rotation and translation: the similarity fit of the live zero field onto
    /// `Z_K`. A uniform shrink of every row is per-row legal and invisible to the band, and
    /// `|log s_z|` reads exactly that common mode.
    pub zero_similarity: Similarity,
    /// The fitted affine component on the gauge population, canonical onto zero. Its
    /// non-similarity part carries the anisotropic deformation the residual `r` prices.
    pub affine: Transform,
    /// The affine fit's root-mean-square residual, normalized against the frozen gauge spread:
    /// the movement no affine map explains.
    pub affine_residual: DNonNegative,
    /// The gauge displacement families, one per populated covariate stratum in ascending
    /// stratum order.
    pub displacement: Vec<DisplacementStratum>,
    /// The saturation tallies, one per populated covariate stratum in ascending stratum order.
    pub saturation: Vec<SaturationStratum>,
    /// The enforcement record's cumulative readings at this evaluation.
    pub enforcement: EnforcementSummary,
}

/// The run-owned references one evaluation reading is taken against.
///
/// The gauge constellation and the band constraint are frozen at the boundary, the strata ride
/// the admitted inputs, and the enforcement record accumulates through the run. A reading
/// borrows them as one value, so the reference set the evidence derives from is named once.
pub(crate) struct EvidenceReferences<'run, N> {
    /// The frozen gauge constellation.
    pub anchors: &'run GaugeAnchors<N>,
    /// The frozen band constraint, whose centre is the sealed `Z_K` field.
    pub projection: &'run BandProjection<N>,
    /// The per-row covariate strata, assigned by the draw.
    pub strata: &'run IdSlice<N, StratumId>,
    /// The running enforcement record.
    pub record: &'run EnforcementRecord<N>,
}

impl EvaluationEvidence {
    /// Assembles one evaluation's evidence reading.
    ///
    /// The live fields arrive proven from their readback boundaries, so every reading -
    /// the whole-field fits and each per-row family - derives from proven-finite
    /// coordinates. The gauge, reference-configuration, and affine fits read the anchor
    /// constellations gathered from those same fields, so every end of the recorded frame
    /// bridge derives from one field realization and the composition is exact on it. The
    /// objective-shape fit arrives as its own recorded reading and enters no bridge. The
    /// displacement and saturation families fold per row in one serial pass each - the reading
    /// runs per evaluation, far off the per-step enforcement path.
    ///
    /// The fields, the projection centre, and the strata share one row domain - a wiring
    /// contract checked in debug builds, since all of them come from one generation.
    ///
    /// # Errors
    ///
    /// Returns [`EvidenceRefusal`] naming the first fit that could not be made.
    pub(crate) fn read<N>(
        step: usize,
        references: &EvidenceReferences<'_, N>,
        fit: &GaugeFit,
        canonical: &FinitePointField<N>,
        zero: &FinitePointField<N>,
    ) -> Result<Self, EvidenceRefusal>
    where
        N: Id,
    {
        debug_assert_eq!(
            canonical.len(),
            zero.len(),
            "the canonical and zero fields should cover the same rows"
        );
        debug_assert_eq!(
            zero.len(),
            references.projection.len(),
            "the live field and the boundary snapshot should cover the same rows"
        );
        debug_assert_eq!(
            zero.len(),
            references.strata.len(),
            "the strata and the fields should cover the same rows"
        );

        let corpus_similarity =
            Similarity::fit_uniform_par(canonical, zero).ok_or(EvidenceRefusal::CorpusAlignment)?;
        let zero_similarity = Similarity::fit_uniform_par(zero, references.projection.centre())
            .ok_or(EvidenceRefusal::ZeroCommonMode)?;

        let anchors = references.anchors;
        let canonical_anchors: Box<FinitePointField<GaugeOrdinal>> =
            canonical.gather(anchors.rows());
        let zero_anchors = zero.gather(anchors.rows());
        let frozen_anchors = references.projection.centre().gather(anchors.rows());
        let gauge_spread = anchors.frozen_spread().widen();

        // Total: an rms residual over f32-born fields stays below ~1.2e87 by its own totality
        // theorem, and the smallest positive f32 spread is 2⁻¹⁴⁹, so a normalized residual
        // sits more than five hundred exponent shells inside the f64 range.
        let normalized = |rms: DNonNegative| (rms / gauge_spread).finish_unchecked();

        let gauge = Similarity::fit_uniform_par(&canonical_anchors, &zero_anchors)
            .ok_or(EvidenceRefusal::Gauge)?;
        let scale = gauge.scale();
        let residual = normalized(gauge.rms_residual_par(&canonical_anchors, &zero_anchors));

        let reference = Similarity::fit_uniform_par(&canonical_anchors, &frozen_anchors)
            .ok_or(EvidenceRefusal::ReferenceConfiguration)?;
        let reference_scale = reference.scale();
        let reference_residual =
            normalized(reference.rms_residual_par(&canonical_anchors, &frozen_anchors));

        let affine = Transform::fit_uniform(&canonical_anchors, &zero_anchors)
            .ok_or(EvidenceRefusal::Affine)?;
        let affine_residual = normalized(affine.rms_residual(&canonical_anchors, &zero_anchors));

        let mut families: BTreeMap<StratumId, Vec<DFinite>> = BTreeMap::new();
        for &row in anchors.rows() {
            let displacement = (DVec2::from(zero[row])
                - DVec2::from(references.projection.centre()[row]))
            .norm_squared();
            // Finite with no check. The field proofs above certified every coordinate
            // finite, and a widened f32 difference squares within the f64 range, so the root
            // is finite too.
            families
                .entry(references.strata[row])
                .or_default()
                .push(displacement.sqrt().finish_unchecked().into());
        }
        let displacement = families
            .into_iter()
            .map(|(stratum, readings)| DisplacementStratum {
                stratum,
                anchors: readings.len() as u64,
                displacement: MovementAggregate::over(&readings),
            })
            .collect();

        let saturation = saturation_tallies(zero, references.projection, references.strata);

        Ok(Self {
            step,
            scale,
            residual,
            objective_scale: fit.scale(),
            objective_residual: fit.residual(),
            effective_count: anchors.effective_count(),
            gauge_similarity: gauge,
            reference_scale,
            reference_residual,
            corpus_similarity,
            zero_similarity,
            affine,
            affine_residual,
            displacement,
            saturation,
            enforcement: EnforcementSummary::read(references.record),
        })
    }

    /// Returns the frame bridge, gauge frame to corpus frame.
    ///
    /// Both ends are recorded, so the bridge is arithmetic: undoing the gauge fit and applying
    /// the corpus fit converts a gauge-frame reading into the corpus frame the published field
    /// keeps. Composition can leave the representable coefficient range, in which case the two
    /// recorded ends remain the complete evidence.
    #[must_use]
    pub(crate) const fn bridge(&self) -> Option<Similarity> {
        self.gauge_similarity.inverse().then(self.corpus_similarity)
    }
}

/// Folds the per-row saturation tallies against the band's floor.
///
/// A row counts as saturated when its squared zero-field displacement from its projection
/// centre reaches the floor. One entry per populated stratum, in ascending stratum order.
fn saturation_tallies<N>(
    zero: &FinitePointField<N>,
    projection: &BandProjection<N>,
    strata: &IdSlice<N, StratumId>,
) -> Vec<SaturationStratum>
where
    N: Id,
{
    let floor = projection.saturation_floor_squared();
    let mut tallies: BTreeMap<StratumId, (u64, u64)> = BTreeMap::new();
    for ((&position, &centre), &stratum) in zero
        .as_raw()
        .iter()
        .zip(projection.centre().as_raw())
        .zip(strata.as_raw())
    {
        let squared = (DVec2::from(position) - DVec2::from(centre))
            .norm_squared()
            .into_raw();
        let tally = tallies.entry(stratum).or_insert((0, 0));
        tally.0 += 1;
        tally.1 += u64::from(squared >= floor);
    }

    tallies
        .into_iter()
        .map(|(stratum, (rows, saturated))| SaturationStratum {
            stratum,
            rows,
            saturated,
        })
        .collect()
}
