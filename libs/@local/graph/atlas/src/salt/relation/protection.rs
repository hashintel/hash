//! The protection index: per-row no-repel evidence over linked pairs.
//!
//! [`ProtectionIndex`] answers one question for an endpoint pair: does its link evidence veto
//! targeted repulsion? Two channels answer it independently, because mined hard negatives aim
//! repulsion at specific pairs while ordinary sampled negatives spread it broadly: each channel
//! carries its own applicability floor and admission threshold.
//!
//! Evidence is stored, judgement is computed: the index holds one [`PairEvidence`] per linked
//! pair (the maxima of the applicability-discounted and undiscounted class evidence over the
//! pair's instances), and every channel's mass under a floor `F` is
//!
//! ```text
//! m_F = max(discounted, F * undiscounted),
//! ```
//!
//! exactly, because the maximum distributes over the per-instance `max(a, F)`: `max_i(c_i p_i
//! max(a_i, F)) = max(max_i(c_i p_i a_i), F max_i(c_i p_i))`. Floors and thresholds are therefore
//! both query-time parameters ([`ProtectionConfig`]), and one built index serves every floor and
//! threshold calibration unchanged.
//!
//! The index is a symmetric compressed sparse row matrix over the node-row domain, each linked pair
//! stored in both of its rows with bit-equal evidence: row `i` lists every partner whose link
//! protects the pair, which is the shape hard-negative mining consumes when it vets the candidates
//! of one projected point.
//!
//! Protection is deliberately blind to attraction strength: class coefficients, degree
//! normalization, strength, and force pruning answer how strongly an admitted force pulls, while
//! protection answers whether repulsion is safe, so none of those factors enters the evidence.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::fmt;

use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};
use sprs::{CsMatI, CsMatViewI};

use crate::{
    dataset::NodeRowId,
    file::sprs::{SprsValue, ValueTag},
};

/// The index's matrix layout: evidence values, `u32` partner columns, `u64` row pointers.
pub(crate) type ProtectionMatrix = CsMatI<PairEvidence, u32, u64>;

/// A borrowed [`ProtectionMatrix`].
pub(crate) type ProtectionMatrixView<'view> = CsMatViewI<'view, PairEvidence, u32, u64>;

/// One linked pair's aggregated class evidence.
///
/// Both components take the maximum over every admitted instance between the pair's rows, parallel
/// links and distinct relations alike: one strong link suffices to veto repulsion, however many
/// weak ones accompany it. Per instance, the class evidence is the effective confidence times the
/// selected Coincident and Proximal probability; `discounted` additionally multiplies the
/// relation's calibrated applicability. The index validates both components finite, non-negative,
/// and ordered `discounted <= undiscounted`.
// FromBytes on purpose: the components carry no construction invariant
// of their own - the index validates its entries as a whole, exactly
// like the semantic graph's mapped weights.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Default,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct PairEvidence {
    /// The applicability-discounted evidence maximum, `max(c * (p_C + p_P) * a)`.
    pub discounted: f32,
    /// The undiscounted evidence maximum, `max(c * (p_C + p_P))`.
    pub undiscounted: f32,
}

impl SprsValue for PairEvidence {
    // Opaque on purpose: the pair is this stage's vocabulary, not a
    // scalar the format vocabulary pins; width is the wire identity.
    const TAG: ValueTag = ValueTag::Opaque;
}

impl PairEvidence {
    /// Returns the pair's evidence mass under an applicability floor.
    ///
    /// This is the exact per-channel mass: the floor's `max(a, F)` distributes through the
    /// per-instance maximum into `max(discounted, floor * undiscounted)`.
    #[inline]
    #[must_use]
    pub(crate) fn mass(self, floor: f32) -> f32 {
        self.discounted.max(floor * self.undiscounted)
    }
}

/// One protection channel's applicability floor and admission threshold, valid by construction.
///
/// The floor lifts a relation's calibrated applicability before it enters the channel's mass, so a
/// relation too unfamiliar to earn pull can still retain enough evidence to veto repulsion; 0
/// leaves applicability undisturbed. The threshold is the mass at which the channel protects; 0
/// protects every linked pair, the conservative reading of link evidence. Floors and thresholds
/// jointly determine the protected set and are calibrated together from reviewed validation pairs.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct ChannelConfig {
    floor: f32 = 0.0,
    threshold: f32 = 0.0,
}

impl ChannelConfig {
    /// Creates a channel configuration.
    ///
    /// Returns [`None`] unless the floor lies in `0.0..=1.0` and the threshold is finite and
    /// non-negative. The default is floor 0, threshold 0.
    #[must_use]
    pub(crate) const fn new(floor: f32, threshold: f32) -> Option<Self> {
        if !(floor >= 0.0 && floor <= 1.0) {
            return None;
        }
        if !(threshold.is_finite() && threshold >= 0.0) {
            return None;
        }
        Some(Self { floor, threshold })
    }

    /// Returns the applicability floor.
    #[inline]
    #[must_use]
    pub(crate) const fn floor(self) -> f32 {
        self.floor
    }

    /// Returns the admission threshold.
    #[inline]
    #[must_use]
    pub(crate) const fn threshold(self) -> f32 {
        self.threshold
    }

    /// Returns whether `evidence` clears the channel.
    #[inline]
    #[must_use]
    pub(crate) fn protects(self, evidence: PairEvidence) -> bool {
        evidence.mass(self.floor) >= self.threshold
    }
}

/// Both channels' query-time protection settings, valid by construction.
///
/// The channels satisfy `ordinary.floor <= hard.floor` and `hard.threshold <= ordinary.threshold`:
/// hard negatives are aimed at specific pairs, so their channel warrants at least as much caution
/// in the floor and no more evidence to trip in the threshold.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ProtectionConfig {
    hard: ChannelConfig = ChannelConfig { .. },
    ordinary: ChannelConfig = ChannelConfig { .. },
    protect_ordinary: bool = true,
}

const impl Default for ProtectionConfig {
    fn default() -> Self {
        Self { .. }
    }
}

impl ProtectionConfig {
    /// Creates a protection configuration from the two channels.
    ///
    /// Returns [`None`] unless `ordinary.floor <= hard.floor` and `hard.threshold <=
    /// ordinary.threshold`. `protect_ordinary` disables the ordinary channel outright: every
    /// ordinary negative is admitted while hard-negative protection stands. The default is both
    /// channels at floor 0 and threshold 0 with both active.
    #[must_use]
    pub(crate) const fn new(
        hard: ChannelConfig,
        ordinary: ChannelConfig,
        protect_ordinary: bool,
    ) -> Option<Self> {
        if ordinary.floor > hard.floor || hard.threshold > ordinary.threshold {
            return None;
        }
        Some(Self {
            hard,
            ordinary,
            protect_ordinary,
        })
    }

    /// Returns the hard-negative channel.
    #[inline]
    #[must_use]
    pub(crate) const fn hard(self) -> ChannelConfig {
        self.hard
    }

    /// Returns the ordinary-negative channel.
    #[inline]
    #[must_use]
    pub(crate) const fn ordinary(self) -> ChannelConfig {
        self.ordinary
    }

    /// Returns whether the ordinary channel protects at all.
    #[inline]
    #[must_use]
    pub(crate) const fn protect_ordinary(self) -> bool {
        self.protect_ordinary
    }
}

/// An unordered pair of node rows in canonical order.
///
/// The two rows are stored with [`first`](Self::first) at most [`second`](Self::second), so a pair
/// equals itself however its rows arrive.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct NodePair {
    first: NodeRowId,
    second: NodeRowId,
}

impl NodePair {
    /// Creates the canonical pair of two rows, in either order.
    #[inline]
    #[must_use]
    pub(crate) const fn new(one: NodeRowId, other: NodeRowId) -> Self {
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

/// A pair's protection verdict under a configuration.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PairVerdict {
    /// Whether the pair is barred from hard-negative mining.
    pub hard: bool,
    /// Whether the pair is barred from ordinary negative sampling.
    pub ordinary: bool,
}

impl PairVerdict {
    /// The verdict of a pair without link evidence: unprotected in both channels.
    pub(crate) const UNPROTECTED: Self = Self {
        hard: false,
        ordinary: false,
    };
}

/// One protected partner of a row.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ProtectedPartner {
    /// The other endpoint's node row.
    pub partner: NodeRowId,
    /// The pair's aggregated evidence.
    pub evidence: PairEvidence,
}

/// A matrix violated a [`ProtectionIndex`] invariant.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ProtectionValidationError {
    /// The matrix is compressed by column.
    ColumnCompressed,
    /// The matrix is not square over the row domain.
    NotSquare { rows: usize, columns: usize },
    /// A row references itself.
    SelfEdge { row: usize },
    /// A stored evidence component is not finite or negative.
    EvidenceOutOfRange { row: usize, column: usize },
    /// A stored evidence pair has `discounted > undiscounted`.
    EvidenceOrdering { row: usize, column: usize },
    /// An edge is stored in one direction only.
    AsymmetricSupport { row: usize, column: usize },
    /// An edge's two stored evidence pairs differ.
    AsymmetricEvidence { row: usize, column: usize },
}

impl fmt::Display for ProtectionValidationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::ColumnCompressed => {
                fmt.write_str("the protection matrix is compressed by column")
            }
            Self::NotSquare { rows, columns } => write!(
                fmt,
                "the protection matrix spans {rows} rows by {columns} columns",
            ),
            Self::SelfEdge { row } => write!(fmt, "row {row} references itself"),
            Self::EvidenceOutOfRange { row, column } => write!(
                fmt,
                "the evidence between rows {row} and {column} has a non-finite or negative \
                 component",
            ),
            Self::EvidenceOrdering { row, column } => write!(
                fmt,
                "the evidence between rows {row} and {column} discounts above its undiscounted \
                 component",
            ),
            Self::AsymmetricSupport { row, column } => write!(
                fmt,
                "the edge from row {row} to row {column} has no reverse entry",
            ),
            Self::AsymmetricEvidence { row, column } => write!(
                fmt,
                "the edge between rows {row} and {column} stores different evidence in its two \
                 directions",
            ),
        }
    }
}

impl core::error::Error for ProtectionValidationError {}

/// Checks every index invariant over a borrowed matrix.
///
/// Rows check in parallel; the reported violation is the first in row order regardless of
/// scheduling, so failures are deterministic.
// The symmetry check compares the two directions bit-exactly (derived
// PartialEq over the f32 components): both are written from one
// aggregated value, so bit equality is the constructed contract.
pub(super) fn validate(matrix: ProtectionMatrixView<'_>) -> Result<(), ProtectionValidationError> {
    if !matrix.is_csr() {
        return Err(ProtectionValidationError::ColumnCompressed);
    }

    let (rows, columns) = (matrix.rows(), matrix.cols());
    if rows != columns {
        return Err(ProtectionValidationError::NotSquare { rows, columns });
    }

    (0..rows)
        .into_par_iter()
        .find_map_first(|row| validate_row(matrix, row).err())
        .map_or(Ok(()), Err)
}

/// Checks one row's entries against the index invariants.
fn validate_row(
    matrix: ProtectionMatrixView<'_>,
    row: usize,
) -> Result<(), ProtectionValidationError> {
    let stored = matrix
        .outer_view(row)
        .expect("the row index iterates the validated square dimension");

    for (column, &evidence) in stored.iter() {
        if column == row {
            return Err(ProtectionValidationError::SelfEdge { row });
        }

        let ordered = evidence.discounted >= 0.0
            && evidence.undiscounted >= 0.0
            && evidence.undiscounted.is_finite();
        if !ordered {
            return Err(ProtectionValidationError::EvidenceOutOfRange { row, column });
        }

        if evidence.discounted > evidence.undiscounted {
            return Err(ProtectionValidationError::EvidenceOrdering { row, column });
        }

        let reverse = matrix
            .outer_view(column)
            .and_then(|entries| entries.get(row).copied());
        let Some(reverse) = reverse else {
            return Err(ProtectionValidationError::AsymmetricSupport { row, column });
        };

        if reverse != evidence {
            return Err(ProtectionValidationError::AsymmetricEvidence { row, column });
        }
    }

    Ok(())
}

/// The symmetric no-repel evidence matrix of one generation.
///
/// Row `i` stores the evidence of every protected pair at node row `i`, keyed by the other endpoint
/// in ascending row order; every pair appears in both of its rows with bit-equal evidence, and no
/// row references itself. A pair absent from the matrix has no admitted link between its rows and
/// is unprotected under every configuration.
#[derive(Debug, Clone)]
pub(crate) struct ProtectionIndex(ProtectionMatrix);

impl ProtectionIndex {
    /// Validates an evidence matrix against the index invariants.
    ///
    /// # Errors
    ///
    /// Returns an error when the matrix is not row-compressed, not square, self-referencing, stores
    /// a non-finite, negative, or misordered evidence pair, or stores an edge whose two directions
    /// are missing or unequal.
    pub(crate) fn new(matrix: ProtectionMatrix) -> Result<Self, ProtectionValidationError> {
        validate(matrix.view())?;
        Ok(Self(matrix))
    }

    /// Borrows the index.
    #[inline]
    #[must_use]
    pub(crate) fn view(&self) -> ProtectionView<'_> {
        ProtectionView(self.0.view())
    }

    /// Borrows the evidence matrix for sparse operations.
    #[inline]
    #[must_use]
    pub(crate) fn matrix(&self) -> ProtectionMatrixView<'_> {
        self.0.view()
    }
}

/// Borrowed rows of one validated [`ProtectionIndex`].
#[derive(Debug, Clone)]
pub(crate) struct ProtectionView<'view>(ProtectionMatrixView<'view>);

impl<'view> ProtectionView<'view> {
    /// Wraps a matrix whose invariants already hold.
    ///
    /// The caller promises the matrix passed [`validate`]; the wrapper performs no checks of its
    /// own.
    #[inline]
    #[must_use]
    pub(super) const fn new_unchecked(matrix: ProtectionMatrixView<'view>) -> Self {
        Self(matrix)
    }

    /// Returns the node-row count.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> usize {
        self.0.rows()
    }

    /// Returns the stored entry count, counting each pair twice.
    #[inline]
    #[must_use]
    pub(crate) fn entries(&self) -> usize {
        self.0.nnz()
    }

    /// Returns row `row`'s protected partners in ascending row order.
    ///
    /// # Panics
    ///
    /// Panics when `row` is outside the matrix's row domain.
    pub(crate) fn row(&self, row: NodeRowId) -> impl Iterator<Item = ProtectedPartner> + 'view {
        let (indptr, columns, evidence) = self.0.into_raw_storage();
        let position = |pointer: u64| {
            usize::try_from(pointer).expect("a resident index's entries fit the address space")
        };

        let range = position(indptr[row.usize()])..position(indptr[row.usize() + 1]);

        columns[range.clone()]
            .iter()
            .zip(&evidence[range])
            .map(|(&column, &evidence)| ProtectedPartner {
                partner: NodeRowId::new(u64::from(column)),
                evidence,
            })
    }

    /// Looks up a pair's evidence.
    ///
    /// Returns [`None`] when no admitted link connects the pair's rows, or either row lies outside
    /// the row domain. Time is one row resolution plus a binary search of that row's partners.
    #[must_use]
    pub(crate) fn get(&self, pair: NodePair) -> Option<PairEvidence> {
        let (indptr, columns, evidence) = self.0.into_raw_storage();
        if pair.second().usize() >= self.rows() {
            return None;
        }

        let position = |pointer: u64| {
            usize::try_from(pointer).expect("a resident index's entries fit the address space")
        };
        let range =
            position(indptr[pair.first().usize()])..position(indptr[pair.first().usize() + 1]);

        #[expect(
            clippy::cast_possible_truncation,
            reason = "the validated square matrix bounds columns to the u32-encoded row domain"
        )]
        let partner = pair.second().get() as u32;
        columns[range.clone()]
            .binary_search(&partner)
            .ok()
            .map(|offset| evidence[range][offset])
    }

    /// Judges a pair's protection under the given configuration.
    ///
    /// A channel protects when the pair's evidence mass under the channel's floor reaches the
    /// channel's threshold; a pair without link evidence is unprotected in both channels.
    #[must_use]
    pub(crate) fn judge(&self, pair: NodePair, config: ProtectionConfig) -> PairVerdict {
        let Some(evidence) = self.get(pair) else {
            return PairVerdict::UNPROTECTED;
        };
        PairVerdict {
            hard: config.hard().protects(evidence),
            ordinary: config.protect_ordinary() && config.ordinary().protects(evidence),
        }
    }
}
