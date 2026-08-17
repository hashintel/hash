//! The target objective's declared inputs.
//!
//! Every value here is decided before optimization. [`TargetOptions`] carries the declared
//! constants, [`TargetSplit`] the versioned split identity with its reference populations,
//! [`GaugeDraw`] the stratified anchor draw, and [`TargetInputs`] binds them beside the
//! covariate strata into the one value the trainer admits. Nothing in this module is
//! measured during the run.

use core::{fmt, num::NonZero};

use hashql_core::id::IdSlice;

use crate::{
    integrity::Sha256Digest,
    math::{NonNegative, Positive, PositiveUnitFraction},
    salt::projector::{
        evidence::StratumId,
        gauge::DuplicateClassId,
        loss::{Penalty, UnitLaw},
    },
};

/// The target objective's declared constants.
///
/// Every field is a declared value of the run configuration, from the treatment activation and
/// the stage radius to the ruler's regularizer window and the gauge rules whose numbers bind
/// only when declared. The penalty rides as a declared member of the sanctioned family, so the
/// wiring fixes no variant choice.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct TargetOptions {
    /// The canonical condition's index into [`RUNGS`](super::super::super::RUNGS).
    ///
    /// Structurally non-zero: the estimand compares the canonical rung against the zero rung,
    /// and a canonical rung equal to the baseline would read a self-comparison.
    pub canonical_rung: NonZero<usize>,
    /// `λ`: the treatment activation.
    ///
    /// Zero is the reference replicate's value, with the whole code path live.
    pub activation: NonNegative,
    /// `β_proj`: the declared dimensionless projection radius.
    pub dimensionless_radius: Positive,
    /// `ε_rel`: the ruler's declared dimensionless regularizer.
    pub epsilon_rel: Positive,
    /// The declared quantile defining the ruler window's upper bound.
    pub scale_quantile: PositiveUnitFraction,
    /// `κ_ε`: the ruler window's lower-half constant. The lower test binds only when declared.
    pub epsilon_floor: Option<Positive>,
    /// `m`: the violation margin, a value the caller declares.
    pub margin: NonNegative,
    /// `κ`: the gauge minimum-spread factor. The rule binds only when declared.
    pub gauge_spread_factor: Option<Positive>,
    /// The gauge's minimum effective anchor count. The rule binds only when declared.
    pub minimum_effective_count: Option<Positive>,
    /// The gauge fit's maximum normalized residual. The bar binds only when declared.
    pub residual_bar: Option<Positive>,
    /// The penalty `φ`, drawn from the sanctioned family.
    ///
    /// The family evaluates value and exact slope in one implementation, finite at every finite
    /// violation by construction. The variant is the caller's declared choice. The declared
    /// variant's subgradient must keep corrective force at `v = 0` unless a positive margin
    /// already makes equality a nonzero violation, and admission enforces that pairing.
    pub penalty: Penalty,
    /// The declared unit law. Every population derivation conditions on it.
    pub unit_law: UnitLaw,
}

/// Names one of the declared split populations in a refusal.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SplitPopulation {
    /// Endpoint rows of force-bearing attraction instances.
    MovementParticipants,
    /// The gauge anchor draw.
    GaugeAnchors,
    /// Held-out pair endpoint rows.
    HeldOutEndpoints,
    /// Matched control rows.
    MatchedControls,
}

impl fmt::Display for SplitPopulation {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MovementParticipants => fmt.write_str("the movement participants"),
            Self::GaugeAnchors => fmt.write_str("the gauge anchors"),
            Self::HeldOutEndpoints => fmt.write_str("the held-out endpoints"),
            Self::MatchedControls => fmt.write_str("the matched controls"),
        }
    }
}

/// The validated split identity.
///
/// The rule digest rides beside the reference populations one versioned split fixed before
/// optimization. The movement participants, gauge anchors, held-out endpoints, and matched
/// controls must be pairwise-disjoint under that one rule, and admission checks every pair
/// the trainer can see. The digest rides the run evidence so the population identity stays
/// auditable.
#[derive(Debug, Copy, Clone)]
pub(crate) struct TargetSplit<'run, N> {
    /// The versioned split rule's content digest.
    pub digest: Sha256Digest,
    /// Held-out pair endpoint rows, in draw order.
    pub held_out: &'run [N],
    /// Matched control rows, in draw order.
    pub matched_controls: &'run [N],
}

/// One stratified gauge draw, each anchor row beside its duplicate class.
///
/// The pairing is a construction fact, so no consumer re-checks the two lengths and no zip
/// over a malformed draw can silently truncate.
#[derive(Debug, Copy, Clone)]
pub(crate) struct GaugeDraw<'run, N> {
    rows: &'run [N],
    classes: &'run [DuplicateClassId],
}

impl<'run, N> GaugeDraw<'run, N> {
    /// Pairs the draw's anchor rows with their duplicate classes.
    ///
    /// # Panics
    ///
    /// This panics when the two slices disagree in length. Both come from one draw, so a
    /// mismatch is a wiring defect.
    pub(crate) fn new(rows: &'run [N], classes: &'run [DuplicateClassId]) -> Self {
        assert_eq!(
            rows.len(),
            classes.len(),
            "anchor rows and duplicate classes come from one draw"
        );

        Self { rows, classes }
    }

    /// Borrows the anchor rows, in draw order.
    pub(crate) const fn rows(&self) -> &'run [N] {
        self.rows
    }

    /// Borrows each anchor's duplicate class, aligned with the rows.
    pub(crate) const fn classes(&self) -> &'run [DuplicateClassId] {
        self.classes
    }
}

/// The target objective's whole run configuration.
///
/// The declared constants ride beside the run-borrowed draws.
///
/// The split machinery owns every draw here. Gauge membership, the reference populations, and
/// the covariate partition are decided before optimization by the one versioned rule the
/// split identity's digest names, and the trainer consumes the outcome. The constants ride the
/// same value, so a configuration cannot arrive half-declared.
#[derive(Debug, Copy, Clone)]
pub(crate) struct TargetInputs<'run, N> {
    /// The declared constants.
    pub options: TargetOptions,
    /// The gauge anchor draw, rows paired with their duplicate classes.
    pub gauge: GaugeDraw<'run, N>,
    /// The covariate stratum of every corpus row, the evidence families' group labels.
    pub strata: &'run IdSlice<N, StratumId>,
    /// The validated split identity the populations arrived under.
    pub split: TargetSplit<'run, N>,
}
