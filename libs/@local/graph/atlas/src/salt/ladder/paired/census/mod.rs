//! Candidate populations and bounded, repeatable paired-movement samples.
//!
//! [`Draw::over`] samples one generation's attraction index. The census walks two candidate
//! domains. The pair domain holds every distinct oriented `(source, target)` pair among the
//! [force-bearing Proximal instances](crate::salt::relation::attraction::AttractionEdge): the edges
//! of the groups whose Proximal class weight is positive, deduplicated across groups with
//! orientation kept. The control domain holds every nonparticipant corpus row: a row that no
//! retained instance of any force class names as an endpoint.
//!
//! The draw orders each domain ascending by `(order key, subject)` and keeps a bounded prefix:
//! `n = min(P, SAMPLE_CAP)` of the `P` candidate pairs and `m = min(Q, n)` of the `Q` candidate
//! rows. The subject tie-break keeps the order total even when digests collide. The draw is a
//! function of the rule, salt, corpus row count and index regions. An empty pair domain
//! short-circuits into the `P = 0` outcome: zero counts on both domains and no control population
//! at all.
//!
//! Scratch stays bounded by the index and the draw. The deduplication buffer holds the Proximal
//! instances and the participant set spends one bit per corpus row, while each selection works
//! in a heap of at most its own sample size. The census refuses an index whose group ranges or edge
//! endpoints contradict its own geometry ([`CensusError`]) instead of reading around the
//! contradiction. Supply regions satisfying the [attraction
//! index](crate::salt::relation::attraction::AttractionIndex)'s remaining invariants. The census
//! checks neither complete group coverage of the edge region nor each edge's force factor.

#[cfg(test)]
mod tests;

use alloc::collections::BinaryHeap;
use core::{error::Error, fmt};

use hashql_core::id::Id;

use super::identity::{DrawRule, DrawSalt};
use crate::{
    bitset::DenseBitSlice,
    file::attraction::{EdgeRecord, GroupRecord},
    identity::{EdgeRowId, NodeRowId},
};

/// The maximum number of sampled pairs.
///
/// The cap uses the Dvoretzky-Kiefer-Wolfowitz calibration for an independent random sample: 2 ·
/// exp(−2nε²) ≤ δ, where n is the sample count, ε is the maximum empirical-CDF error and δ is the
/// failure-probability bound. At ε = 0.01 and δ = 10⁻⁶, n ≥ ⌈ln(2/δ)/(2ε²)⌉ = 72,544. The cap adds
/// eleven rows.
///
/// This deterministic digest-ordered, without-replacement draw does not itself establish that
/// random-sampling model or its probability guarantee. A pair domain at or below the cap is
/// measured in full. The calibration supplies no per-stratum control guarantee.
pub(super) const SAMPLE_CAP: usize = 72_555;

/// An invalid group range or endpoint encountered during the census.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum CensusError<I> {
    /// A group's edge range contradicts the edge region.
    GroupRange {
        /// The group's position in the group region.
        group: u64,
        /// The range's first edge position.
        start: u64,
        /// The range's one-past-last edge position.
        ///
        /// The next group's start, or the edge count for the final group.
        end: u64,
        /// The edge count the range must stay within.
        edges: u64,
    },
    /// An edge names an endpoint at or beyond the corpus row count.
    Endpoint {
        /// The edge's position in the edge region.
        edge: u64,
        /// The named row.
        row: I,
        /// The corpus row count.
        rows: u64,
    },
}

impl<I> fmt::Display for CensusError<I>
where
    I: Id,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::GroupRange {
                group,
                start,
                end,
                edges,
            } => write!(
                fmt,
                "group {group} spans edges {start}..{end} where the file holds {edges}",
            ),
            Self::Endpoint { edge, row, rows } => write!(
                fmt,
                "edge {edge} names row {row} where the corpus holds {rows} rows",
            ),
        }
    }
}

impl<I> Error for CensusError<I> where I: Id {}

/// An oriented source-target pair eligible for sampling.
///
/// The derived order is the draw's subject tie-break: ascending `(source, target)`. The subject
/// encoding behind the primary key is the rule's ([`DrawRule::pair_order_key`]).
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct Pair {
    /// The corpus row the instance points from.
    pub source: NodeRowId,
    /// The corpus row the instance points to.
    pub target: NodeRowId,
}

/// One completed draw over a generation's attraction index.
///
/// The selections keep draw order, ascending `(order key, subject)`. Candidate counts cover the
/// whole corresponding domains when the pair population is nonempty. An empty pair population
/// records zero controls without counting nonparticipants.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Draw {
    /// The distinct force-bearing Proximal pair count `P`.
    pair_candidates: u64,
    /// The `n = min(P, SAMPLE_CAP)` drawn pairs, in draw order.
    pairs: Vec<Pair>,
    /// The nonparticipant corpus row count `Q`, or zero when no pairs were eligible.
    control_candidates: u64,
    /// The `m = min(Q, n)` drawn control rows, in draw order.
    controls: Vec<NodeRowId>,
}

impl Draw {
    /// Takes one generation's draw over its attraction index.
    ///
    /// `rows` is the corpus row count the endpoints index into, and `groups` and `edges` are the
    /// index's regions in file order, obtainable from [`AttractionFile`]. The same rule, salt, row
    /// count and regions always produce the same selections. A positive Proximal group weight
    /// admits all its edges, including self-pairs, without rechecking their confidence or strength.
    ///
    /// # Complexity
    ///
    /// For G groups, E edges, L Proximal-group edges, N rows and quotas n and m, work is O(G + E +
    /// L log(L + 1) + P log(n + 2) + N log(m + 2)). Scratch is O(G + L + N/8 + n + m) bytes up to
    /// record-size factors. When P = 0, the participant allocation and row sweep are skipped.
    ///
    /// # Panics
    ///
    /// Panics for a nonempty pair domain when `rows` exceeds [`usize::MAX`].
    ///
    /// # Errors
    ///
    /// [`CensusError`] when a group's edge range or an edge's endpoint contradicts the index's
    /// own geometry.
    ///
    /// [`AttractionFile`]: crate::file::attraction::read::AttractionFile
    pub(crate) fn over(
        rule: DrawRule,
        salt: DrawSalt,
        rows: u64,
        groups: &[GroupRecord],
        edges: &[EdgeRecord<NodeRowId, EdgeRowId>],
    ) -> Result<Self, CensusError<NodeRowId>> {
        let ranges = edge_ranges(groups, edges)?;

        for (index, record) in edges.iter().enumerate() {
            for row in [record.source(), record.target()] {
                if u64::from(row) >= rows {
                    return Err(CensusError::Endpoint {
                        edge: index as u64,
                        row,
                        rows,
                    });
                }
            }
        }

        // The pair domain is the distinct oriented pairs of the Proximal-bearing groups.
        let mut candidates = Vec::new();
        for (group, &(start, end)) in groups.iter().zip(&ranges) {
            if group.proximal() > 0.0 {
                candidates.extend(edges[start..end].iter().map(|record| Pair {
                    source: record.source(),
                    target: record.target(),
                }));
            }
        }
        candidates.sort_unstable();
        candidates.dedup();
        let pair_candidates = candidates.len() as u64;

        // The `P = 0` outcome: zero counts on both domains and no control population.
        if candidates.is_empty() {
            return Ok(Self {
                pair_candidates: 0,
                pairs: Vec::new(),
                control_candidates: 0,
                controls: Vec::new(),
            });
        }

        // n = min(P, SAMPLE_CAP).
        let pair_quota = SAMPLE_CAP.min(candidates.len());
        let pairs: Vec<Pair> = select(
            candidates
                .iter()
                .map(|&pair| (rule.pair_order_key(salt, pair.source, pair.target), pair)),
            pair_quota,
        )
        .into_iter()
        .map(|(_key, pair)| pair)
        .collect();

        // The control domain is the corpus rows no retained instance names as an endpoint.
        // The endpoint sweep above proved both rows of every edge in-domain.
        let participants = participants(rows, edges);
        let control_candidates = rows - participants.count();

        // m = min(Q, n).
        let control_quota = pairs
            .len()
            .min(usize::try_from(control_candidates).expect("bounded by the corpus row count"));
        let controls: Vec<NodeRowId> = select(
            (0..rows)
                .map(NodeRowId::new)
                .filter(|&row| !participants.contains(row))
                .map(|row| (rule.row_order_key(salt, row), row)),
            control_quota,
        )
        .into_iter()
        .map(|(_key, row)| row)
        .collect();

        Ok(Self {
            pair_candidates,
            pairs,
            control_candidates,
            controls,
        })
    }

    /// Returns the distinct force-bearing Proximal pair count `P`.
    #[must_use]
    pub(crate) const fn pair_candidates(&self) -> u64 {
        self.pair_candidates
    }

    /// Views the drawn pairs, in draw order.
    #[must_use]
    pub(crate) const fn pairs(&self) -> &[Pair] {
        &self.pairs
    }

    /// Returns the nonparticipant corpus row count `Q`.
    #[must_use]
    pub(crate) const fn control_candidates(&self) -> u64 {
        self.control_candidates
    }

    /// Views the drawn control rows, in draw order.
    #[must_use]
    pub(crate) const fn controls(&self) -> &[NodeRowId] {
        &self.controls
    }

    /// Returns the sampled anchor set: the distinct endpoints of the drawn pairs, ascending.
    #[must_use]
    pub(super) fn anchors(&self) -> Vec<NodeRowId> {
        let mut anchors: Vec<NodeRowId> = self
            .pairs
            .iter()
            .flat_map(|pair| [pair.source, pair.target])
            .collect();
        anchors.sort_unstable();
        anchors.dedup();
        anchors
    }
}

/// Marks every corpus row a retained instance names as an endpoint.
///
/// The complement defines control eligibility for sampling and for the collateral-stratum census.
///
/// # Panics
///
/// Panics when `rows` exceeds [`usize::MAX`] or an endpoint is outside `0..rows`.
pub(super) fn participants(
    rows: u64,
    edges: &[EdgeRecord<NodeRowId, EdgeRowId>],
) -> Box<DenseBitSlice<NodeRowId>> {
    let domain = usize::try_from(rows).expect("a placed corpus fits the address space");
    let mut participants = DenseBitSlice::new_empty(domain);

    for record in edges {
        participants.insert(record.source());
        participants.insert(record.target());
    }

    participants
}

/// Resolves each group's edge range, refusing boundaries the edge region contradicts.
///
/// Group `i` spans `first_edge[i] .. first_edge[i + 1]`, with the final group ending at the edge
/// count. The first range need not start at zero, and an empty group slice returns no ranges even
/// when edges exist.
///
/// # Errors
///
/// Returns [`CensusError`] for a backwards boundary or a boundary past the edge count.
fn edge_ranges(
    groups: &[GroupRecord],
    edges: &[EdgeRecord<NodeRowId, EdgeRowId>],
) -> Result<Vec<(usize, usize)>, CensusError<NodeRowId>> {
    let edge_count = edges.len() as u64;
    let mut ranges = Vec::with_capacity(groups.len());
    for (group, record) in groups.iter().enumerate() {
        let start = record.edge_offset();
        let end = groups
            .get(group + 1)
            .map_or(edge_count, GroupRecord::edge_offset);

        if start > end || end > edge_count {
            return Err(CensusError::GroupRange {
                group: group as u64,
                start,
                end,
                edges: edge_count,
            });
        }
        ranges.push((
            usize::try_from(start).expect("bounded by the edge count, a slice length"),
            usize::try_from(end).expect("bounded by the edge count, a slice length"),
        ));
    }
    Ok(ranges)
}

/// Selects the `quota` least candidates, ascending.
///
/// Streams the candidates through a bounded max-heap, replacing the current largest selected value
/// when a smaller candidate appears. Returns at most `quota` entries, or an empty vector at quota
/// zero. Storage is O(quota), and each candidate takes O(log(quota + 2)) work.
fn select<T: Ord>(candidates: impl Iterator<Item = T>, quota: usize) -> Vec<T> {
    let mut selected = BinaryHeap::with_capacity(quota);
    for candidate in candidates {
        if selected.len() < quota {
            selected.push(candidate);
            continue;
        }
        if let Some(mut worst) = selected.peek_mut()
            && candidate < *worst
        {
            *worst = candidate;
        }
    }
    selected.into_sorted_vec()
}
