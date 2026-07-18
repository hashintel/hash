//! The protection index: pair-aggregated no-repel evidence.
//!
//! [`ProtectionIndex`] answers one question for an endpoint pair: does
//! its link evidence veto targeted repulsion? Two channels answer it
//! independently, because mined hard negatives aim repulsion at specific
//! pairs while ordinary sampled negatives spread it broadly: each channel
//! carries its own evidence mass and its own admission threshold.
//!
//! Masses are evidence, thresholds are judgement, and the two stay
//! separate: the index stores per-pair masses computed at build time
//! (confidence times floored applicability times the selected Coincident
//! and Proximal probability), and [`ProtectionIndex::judge`] compares
//! them against caller-supplied [`AdmissionThresholds`]. Recalibrating a
//! threshold therefore reuses the built index unchanged.
//!
//! Protection is deliberately blind to attraction strength: class
//! coefficients, degree normalization, strength, and force pruning
//! answer how strongly an admitted force pulls, while protection answers
//! whether repulsion is safe, so none of those factors enters a mass.

use super::error::RelationIndexError;
use crate::dataset::NodeRowId;

/// Per-channel applicability floors for protection masses.
///
/// A floor lifts a relation's calibrated applicability before it enters
/// the channel's mass, so a relation too unfamiliar to earn pull can
/// still retain enough evidence to veto repulsion. Floors satisfy
/// `0 <= ordinary <= hard <= 1`: hard negatives are aimed at specific
/// pairs, so their channel warrants at least as much caution. The
/// default floors of 0 leave applicability undisturbed; positive floors
/// require recalibrated admission thresholds, because floors and
/// thresholds jointly determine the protected set.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct ProtectionOptions {
    /// The hard-negative channel's applicability floor. Defaults to 0.
    pub hard_floor: f32 = 0.0,
    /// The ordinary-negative channel's applicability floor. Defaults
    /// to 0.
    pub ordinary_floor: f32 = 0.0,
}

impl ProtectionOptions {
    /// Checks both floors against their domain and ordering.
    ///
    /// # Errors
    ///
    /// Returns an error when a floor lies outside `0.0..=1.0` or the
    /// ordinary floor exceeds the hard floor.
    pub(super) fn validate(self) -> Result<(), RelationIndexError> {
        if !(0.0..=1.0).contains(&self.hard_floor)
            || !(0.0..=1.0).contains(&self.ordinary_floor)
            || self.ordinary_floor > self.hard_floor
        {
            return Err(RelationIndexError::ProtectionFloors {
                hard: self.hard_floor,
                ordinary: self.ordinary_floor,
            });
        }
        Ok(())
    }
}

/// Per-channel evidence masses required to protect a pair.
///
/// A pair is protected in a channel when its stored mass reaches the
/// channel's threshold. Thresholds satisfy `0 <= hard <= ordinary`:
/// vetoing a targeted hard negative takes no more evidence than vetoing
/// a broad sampled one. The defaults of 0 protect every linked pair in
/// both channels, the conservative reading of link evidence; a
/// generation's calibration selects real thresholds from reviewed
/// validation pairs.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct AdmissionThresholds {
    /// The hard-negative channel's mass threshold. Defaults to 0.
    pub hard: f32 = 0.0,
    /// The ordinary-negative channel's mass threshold. Defaults to 0.
    pub ordinary: f32 = 0.0,
    /// Whether the ordinary channel protects at all. Defaults to true;
    /// disabling it admits every ordinary negative while hard-negative
    /// protection stands.
    pub protect_ordinary: bool = true,
}

impl AdmissionThresholds {
    /// Checks both thresholds against their domain and ordering.
    ///
    /// Judging is total either way; this is the configuration
    /// boundary's check, run once where the thresholds are chosen.
    ///
    /// # Errors
    ///
    /// Returns an error when a threshold is negative or not finite, or
    /// the hard threshold exceeds the ordinary threshold.
    pub(crate) fn validate(self) -> Result<(), RelationIndexError> {
        if !self.hard.is_finite()
            || !self.ordinary.is_finite()
            || self.hard < 0.0
            || self.ordinary < 0.0
            || self.hard > self.ordinary
        {
            return Err(RelationIndexError::AdmissionThresholds {
                hard: self.hard,
                ordinary: self.ordinary,
            });
        }
        Ok(())
    }
}

/// An unordered pair of node rows in canonical order.
///
/// The two rows are stored with [`first`](Self::first) at most
/// [`second`](Self::second), so a pair equals itself however its rows
/// arrive.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct NodePair {
    first: NodeRowId,
    second: NodeRowId,
}

impl NodePair {
    /// Creates the canonical pair of two rows, in either order.
    #[inline]
    #[must_use]
    pub(crate) fn new(one: NodeRowId, other: NodeRowId) -> Self {
        if one.get() <= other.get() {
            Self {
                first: one,
                second: other,
            }
        } else {
            Self {
                first: other,
                second: one,
            }
        }
    }

    /// Returns the smaller row.
    #[inline]
    #[must_use]
    pub(crate) const fn first(self) -> NodeRowId {
        self.first
    }

    /// Returns the larger row.
    #[inline]
    #[must_use]
    pub(crate) const fn second(self) -> NodeRowId {
        self.second
    }

    /// Returns the pair's total sort key.
    #[inline]
    pub(super) const fn key(self) -> (u64, u64) {
        (self.first.get(), self.second.get())
    }
}

/// One linked pair's evidence masses, aggregated over its instances.
///
/// Each channel's mass is the maximum over every admitted instance
/// between the pair's rows, parallel links and distinct relations alike:
/// one strong link suffices to veto repulsion, however many weak ones
/// accompany it.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct PairProtection {
    /// The protected pair.
    pub pair: NodePair,
    /// The hard-negative channel's evidence mass.
    pub hard_mass: f32,
    /// The ordinary-negative channel's evidence mass.
    pub ordinary_mass: f32,
}

/// A pair's protection verdict under given thresholds.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PairVerdict {
    /// Whether the pair is barred from hard-negative mining.
    pub hard: bool,
    /// Whether the pair is barred from ordinary negative sampling.
    pub ordinary: bool,
}

impl PairVerdict {
    /// The verdict of a pair without link evidence: unprotected in both
    /// channels.
    pub(crate) const UNPROTECTED: Self = Self {
        hard: false,
        ordinary: false,
    };
}

/// Pair-aggregated no-repel evidence of one generation.
///
/// Entries ascend by pair; a pair absent from the index has no admitted
/// link between its rows and is unprotected in both channels.
#[derive(Debug, Clone)]
pub(crate) struct ProtectionIndex {
    pub(super) pairs: Vec<PairProtection>,
}

impl ProtectionIndex {
    /// Borrows the protected pairs, ascending by pair.
    #[inline]
    #[must_use]
    pub(crate) fn pairs(&self) -> &[PairProtection] {
        &self.pairs
    }

    /// Looks up a pair's evidence masses.
    ///
    /// Returns [`None`] when no admitted link connects the pair's rows.
    /// Time is `O(log P)` in the protected-pair count.
    #[must_use]
    pub(crate) fn get(&self, pair: NodePair) -> Option<PairProtection> {
        self.pairs
            .binary_search_by_key(&pair.key(), |entry| entry.pair.key())
            .ok()
            .map(|position| self.pairs[position])
    }

    /// Judges a pair's protection under the given thresholds.
    ///
    /// A channel protects when the pair's stored mass reaches the
    /// channel's threshold; a pair without link evidence is unprotected
    /// in both channels. Time is `O(log P)` in the protected-pair count.
    #[must_use]
    pub(crate) fn judge(&self, pair: NodePair, thresholds: AdmissionThresholds) -> PairVerdict {
        let Some(found) = self.get(pair) else {
            return PairVerdict::UNPROTECTED;
        };
        PairVerdict {
            hard: found.hard_mass >= thresholds.hard,
            ordinary: thresholds.protect_ordinary && found.ordinary_mass >= thresholds.ordinary,
        }
    }
}
