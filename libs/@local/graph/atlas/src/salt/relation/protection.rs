//! Per-row no-repel evidence over linked pairs.
//!
//! [`ProtectionIndex`] answers one question for an endpoint pair. Does its link evidence veto
//! targeted repulsion? Separate channels answer it independently, because mined hard negatives aim
//! repulsion at specific pairs while ordinary sampled negatives spread it across many pairs. Each
//! channel carries its own applicability floor and admission threshold.
//!
//! One [`PairEvidence`] holds the independently aggregated discounted and undiscounted maxima over
//! a pair's instances. With `uᵢ` the non-negative undiscounted evidence, applicability `aᵢ ∈ [0,
//! 1]` and floor `F ∈ [0, 1]`, the governing identity is
//!
//! ```text
//! maxᵢ(uᵢ · max(aᵢ, F)) = max(maxᵢ(uᵢ · aᵢ), F · maxᵢ(uᵢ)).
//! ```
//!
//! Non-negative multiplication is monotone and distributes over a finite maximum. The build narrows
//! `cᵢ · (p_C + p_P)` once to `f32` as `uᵢ` and narrows `aᵢ` once. It computes discounted evidence
//! from those shared values. Rounded non-negative multiplication remains monotone, preserving the
//! identity numerically for these rounded inputs. Therefore `max(discounted, F · undiscounted)`
//! reproduces per-instance flooring without rebuilding the index. It does not recover unrounded
//! real-valued evidence. Floors and thresholds remain query-time parameters of
//! [`ProtectionConfig`].
//!
//! The index is a symmetric compressed sparse row matrix over the node-row domain. Construction
//! copies each pair's aggregate into both directions. Validation requires numerically equal
//! evidence, admitting opposite signs of zero. A stored pair need not pass a channel's threshold.
//! Row-wise access supports checking a point's candidate list.
//!
//! Protection uses class evidence independently of attraction strength. Class coefficients, reading
//! shares, degree normalization, frozen strength and force pruning never enter its evidence.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::{
    fmt,
    marker::{Destruct, PhantomData},
};

use hashql_core::id::Id;
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};
use sprs::{CsMatI, CsMatViewI};

use crate::{
    file::sprs::{SprsValue, ValueTag},
    math::NonNegative,
};

/// A sparse evidence matrix with `u32` partner columns and `u64` row pointers.
pub(crate) type ProtectionMatrix = CsMatI<PairEvidence, u32, u64>;

/// A borrowed [`ProtectionMatrix`].
pub(crate) type ProtectionMatrixView<'view> = CsMatViewI<'view, PairEvidence, u32, u64>;

/// One linked pair's aggregated class evidence.
///
/// Both components take the maximum over every admitted instance between the pair's rows, parallel
/// links and distinct relations alike. One instance suffices to veto repulsion when its floored
/// evidence reaches the channel threshold, however many weaker instances accompany it. The
/// [module's rounding convention](super::protection) defines the components. [`ProtectionIndex`]
/// validates finiteness, non-negativity and `discounted ≤ undiscounted`, but does not verify their
/// derivation from link instances.
// raw f32 fields admit every bit pattern. ProtectionIndex validates their joint evidence contract.
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
    /// The applicability-discounted evidence maximum, `max(c · (p_C + p_P) · a)`.
    pub discounted: f32,
    /// The undiscounted evidence maximum, `max(c · (p_C + p_P))`.
    pub undiscounted: f32,
}

impl PairEvidence {
    /// Returns the pair's evidence mass under an applicability floor.
    ///
    /// Returns `max(discounted, floor · undiscounted)` without validating either input. For the
    /// module's floor identity, `self` must contain valid aggregated evidence.
    #[inline]
    #[must_use]
    pub(crate) fn mass(self, floor: f32) -> f32 {
        self.discounted.max(floor * self.undiscounted)
    }
}

impl SprsValue for PairEvidence {
    // opaque values identify their layout by width, leaving evidence semantics to this index.
    const TAG: ValueTag = ValueTag::Opaque;
}

/// One protection channel's applicability floor and admission threshold, valid by construction.
///
/// The floor lifts a relation's calibrated applicability before it enters the channel's mass, so a
/// relation too unfamiliar to earn pull can still retain enough evidence to veto repulsion. A floor
/// of 0 leaves applicability undisturbed. The threshold is the mass at which the channel protects.
/// A threshold of 0 protects every linked pair, the conservative reading of link evidence. Floors
/// and thresholds jointly determine the protected set. Calibration fixes them together from
/// reviewed validation pairs.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ChannelConfig {
    floor: f32 = 0.0,
    threshold: f32 = 0.0,
}

impl ChannelConfig {
    /// Returns whether the floored mass reaches the channel's threshold.
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

const impl Default for ChannelConfig {
    fn default() -> Self {
        Self { .. }
    }
}

/// Both channels' query-time protection settings, valid by construction.
///
/// The channels satisfy `ordinary.floor ≤ hard.floor` and `hard.threshold ≤ ordinary.threshold`:
/// hard negatives are aimed at specific pairs, so their channel warrants at least as much caution
/// in the floor and no more evidence to trip in the threshold.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ProtectionConfig {
    hard: ChannelConfig = ChannelConfig::default(),
    ordinary: ChannelConfig = ChannelConfig::default(),
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
    /// Returns [`None`] unless `ordinary.floor ≤ hard.floor` and `hard.threshold ≤
    /// ordinary.threshold`. Setting `protect_ordinary` to `false` disables only the ordinary
    /// protection veto. Other negative-sampling exclusions remain independent. By default both
    /// channels use floor zero and threshold zero, with ordinary protection enabled.
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
/// [`Self::lhs`] is the smaller row and [`Self::rhs`] the larger. Equal endpoints are allowed.
/// Pairs order lexicographically by these canonical endpoints.
///
/// # Properties
///
/// For all row ids `a` and `b`, `NodePair::new(a, b) == NodePair::new(b, a)`.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct NodePair<N> {
    lhs: N,
    rhs: N,
}

impl<N> NodePair<N> {
    /// Creates the canonical pair of two rows, in either order.
    #[inline]
    #[must_use]
    pub(crate) const fn new(lhs: N, rhs: N) -> Self
    where
        N: [const] Id,
    {
        if lhs.as_u64() <= rhs.as_u64() {
            Self { lhs, rhs }
        } else {
            Self { lhs: rhs, rhs: lhs }
        }
    }

    /// Returns the smaller row.
    #[inline]
    #[must_use]
    pub(crate) const fn lhs(self) -> N
    where
        N: [const] Destruct,
    {
        self.lhs
    }

    /// Returns the larger row.
    #[inline]
    #[must_use]
    pub(crate) const fn rhs(self) -> N
    where
        N: [const] Destruct,
    {
        self.rhs
    }
}

/// A pair's protection verdict under a configuration.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PairVerdict {
    /// Whether protection bars the pair from hard-negative mining.
    pub hard: bool,
    /// Whether protection bars the pair from ordinary negative sampling.
    pub ordinary: bool,
}

impl PairVerdict {
    /// The verdict of a pair without link evidence: unprotected in both channels.
    pub(crate) const UNPROTECTED: Self = Self {
        hard: false,
        ordinary: false,
    };
}

/// One stored partner and its evidence, before channel judgment.
#[derive(Debug, Copy, Clone, PartialEq)]
#[cfg(any(test, feature = "bench"))]
pub(crate) struct ProtectedPartner<N> {
    /// The other endpoint's node row.
    pub partner: N,
    /// The pair's aggregated evidence.
    pub evidence: PairEvidence,
}

/// A matrix violated a [`ProtectionIndex`] invariant.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ProtectionValidationError {
    /// The matrix uses column compression.
    ColumnCompressed,
    /// The matrix is not square over the row domain.
    NotSquare { rows: usize, columns: usize },
    /// A row references itself.
    SelfEdge { row: usize },
    /// A stored evidence component is not finite or negative.
    EvidenceOutOfRange { row: usize, column: usize },
    /// A stored evidence pair has `discounted > undiscounted`.
    EvidenceOrdering { row: usize, column: usize },
    /// The matrix stores an edge in one direction only.
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
/// Checks compression and shape before checking rows in parallel. The reported row violation is the
/// first in row order regardless of scheduling. Symmetry uses numeric `f32` equality, treating
/// positive and negative zero as equal.
///
/// # Errors
///
/// Returns [`ProtectionValidationError`] for a compression, shape or row-evidence violation.
///
/// # Complexity
///
/// For `N` rows, `M` entries and maximum row length `d`, time is `O(N + M log(d + 1))`.
/// Reverse-entry lookups account for the logarithmic factor.
pub(super) fn validate(matrix: ProtectionMatrixView<'_>) -> Result<(), ProtectionValidationError> {
    if !matrix.is_csr() {
        return Err(ProtectionValidationError::ColumnCompressed);
    }

    let (rows, columns) = matrix.shape();
    if rows != columns {
        return Err(ProtectionValidationError::NotSquare { rows, columns });
    }

    (0..rows)
        .into_par_iter()
        .find_map_first(|row| validate_row(matrix, row).err())
        .map_or(Ok(()), Err)
}

/// Checks one row's values and reverse entries in a square CSR matrix.
///
/// # Errors
///
/// Returns [`ProtectionValidationError`] for an invalid self-edge, evidence value, ordering or
/// reverse entry.
///
/// # Panics
///
/// Panics when `row` is outside the matrix's outer dimension.
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

        let in_range = NonNegative::new(evidence.discounted).is_some()
            && NonNegative::new(evidence.undiscounted).is_some();

        if !in_range {
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
/// Each row lists stored partners in strictly ascending order. Every pair occupies both directions
/// with numerically equal evidence, and no row references itself. A pair absent from the matrix is
/// unprotected under every configuration. Validation establishes these matrix properties, not
/// completeness or provenance relative to a dataset.
///
/// Writing through [`crate::file::WriteInto`] returns an error for zero rows.
///
/// # Panics
///
/// Writing a nonempty matrix with a nonzero initial row pointer panics, although [`Self::new`]
/// accepts such offset pointers.
#[derive(Debug, Clone)]
pub(crate) struct ProtectionIndex<N>(ProtectionMatrix, PhantomData<N>);

impl<N> ProtectionIndex<N>
where
    N: Id,
{
    /// Validates an evidence matrix against the index invariants.
    ///
    /// # Errors
    ///
    /// Returns [`ProtectionValidationError`] for a matrix-invariant violation. See [`validate`] for
    /// check order and cost.
    pub(crate) fn new(matrix: ProtectionMatrix) -> Result<Self, ProtectionValidationError> {
        validate(matrix.view())?;
        Ok(Self(matrix, PhantomData))
    }

    /// Borrows the index.
    #[inline]
    #[must_use]
    pub(crate) fn view(&self) -> ProtectionView<'_, N> {
        ProtectionView::new_unchecked(self.0.view())
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
pub(crate) struct ProtectionView<'view, N>(ProtectionMatrixView<'view>, PhantomData<N>);

impl<'view, N> ProtectionView<'view, N>
where
    N: Id,
{
    /// Borrows an evidence matrix satisfying [`validate`]'s invariants.
    ///
    /// The matrix must satisfy those invariants throughout the borrow.
    // the unchecked promise concerns index semantics, not memory safety.
    #[inline]
    #[must_use]
    pub(super) const fn new_unchecked(matrix: ProtectionMatrixView<'view>) -> Self {
        Self(matrix, PhantomData)
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
    #[cfg(test)] // The relation tests count stored pairs.
    pub(crate) fn entries(&self) -> usize {
        self.0.nnz()
    }

    /// Returns row `row`'s stored partners in ascending row order.
    ///
    /// # Panics
    ///
    /// Panics when `row` is outside the matrix's row domain or a stored partner cannot be
    /// represented by `N`.
    #[cfg(any(test, feature = "bench"))]
    pub(crate) fn row(&self, row: N) -> impl Iterator<Item = ProtectedPartner<N>> + '_ {
        let (columns, evidence) = self
            .0
            .outer_view(row.as_usize())
            .expect("the caller's row lies in the matrix's row domain")
            .into_raw_storage();

        columns
            .iter()
            .zip(evidence)
            .map(|(&column, &evidence)| ProtectedPartner {
                partner: N::from_u32(column),
                evidence,
            })
    }

    /// Looks up a pair's evidence.
    ///
    /// Returns [`None`] when the pair is absent or either row lies outside the matrix domain. Both
    /// ids must be representable as `usize`. Time is a binary search of the smaller endpoint's
    /// stored partners.
    #[must_use]
    pub(crate) fn get(&self, pair: NodePair<N>) -> Option<PairEvidence> {
        self.0
            .get(pair.lhs().as_usize(), pair.rhs().as_usize())
            .copied()
    }

    /// Judges a pair's protection under the given configuration.
    ///
    /// A channel protects when the pair's evidence mass under the channel's floor reaches the
    /// channel's threshold. An absent pair is unprotected in both channels. Both ids must be
    /// representable as `usize`.
    #[must_use]
    pub(crate) fn judge(&self, pair: NodePair<N>, config: ProtectionConfig) -> PairVerdict {
        let Some(evidence) = self.get(pair) else {
            return PairVerdict::UNPROTECTED;
        };

        PairVerdict {
            hard: config.hard().protects(evidence),
            ordinary: config.protect_ordinary() && config.ordinary().protects(evidence),
        }
    }
}
