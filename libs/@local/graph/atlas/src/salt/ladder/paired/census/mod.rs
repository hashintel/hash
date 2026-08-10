//! The candidate census and the draw.
//!
//! [`Draw::over`] samples one generation's attraction index. The census walks two candidate
//! domains. The pair domain holds every distinct oriented `(source, target)` pair among the
//! force-bearing Proximal instances: the edges of the groups whose Proximal class weight is
//! positive, deduplicated across groups with orientation kept. The control domain holds every
//! nonparticipant corpus row: a row that no retained instance of any force class names as an
//! endpoint.
//!
//! The draw orders each domain ascending by `(order key, subject)` and keeps a bounded prefix:
//! `n = min(P, SAMPLE_CAP)` of the `P` candidate pairs and `m = min(Q, n)` of the `Q` candidate
//! rows. The subject tie-break keeps the order total without assuming the keyed hash never
//! collides, so the draw is a function of the rule and the salt over the index bytes alone. An
//! empty pair domain short-circuits into the `P = 0` outcome: zero counts on both domains
//! and no control population at all.
//!
//! Scratch stays bounded by the index and the draw. The deduplication buffer holds the Proximal
//! instances and the participant set spends one bit per corpus row, while each selection works
//! in a heap of at most its own sample size. The census refuses an index whose group ranges or edge
//! endpoints contradict its own geometry ([`CensusError`]) instead of reading around the
//! contradiction; every other domain rule stays `salt::relation`'s artifact contract, validated
//! where the domain types live.

#[cfg(test)]
mod tests;

use alloc::collections::BinaryHeap;
use core::{error::Error, fmt};

use super::identity::{DrawRule, DrawSalt};
use crate::{
    bitset::DenseBitSlice,
    file::attraction::{EdgeRecord, GroupRecord},
    identity::NodeRowId,
};

/// The pair-sample cap.
///
/// The Dvoretzky-Kiefer-Wolfowitz bound `2 · exp(−2 · n · ε²) ≤ δ` at `ε = 0.01` and `δ = 10⁻⁶`
/// has the exact integer minimum 72,544, and the cap adds an eleven-row margin above it. A capped
/// draw therefore holds the sample's whole empirical distribution within one percentile point of
/// its population's, with failure probability at most one in a million, and a smaller pair domain
/// draws whole.
const SAMPLE_CAP: usize = 72_555;

/// The index contradiction the census refused.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum CensusError {
    /// A group's edge range contradicts the edge region.
    GroupRange {
        /// The group's position in the group region.
        group: u64,
        /// The range's first edge position.
        start: u64,
        /// The range's one-past-last edge position, the next group's start or the edge count
        /// for the final group.
        end: u64,
        /// The edge count the range must stay within.
        edges: u64,
    },
    /// An edge names an endpoint at or beyond the corpus row count.
    Endpoint {
        /// The edge's position in the edge region.
        edge: u64,
        /// The named row.
        row: u64,
        /// The corpus row count.
        rows: u64,
    },
}

impl fmt::Display for CensusError {
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

impl Error for CensusError {}

/// One oriented candidate pair, the source row and then the target row.
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
/// The selections keep draw order, ascending `(order key, subject)`, the order every downstream
/// fold consumes. The candidate counts census the whole domains, so evidence records candidates
/// beside selections without retaining an identity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Draw {
    /// The distinct force-bearing Proximal pair count `P`.
    pair_candidates: u64,
    /// The `n = min(P, SAMPLE_CAP)` drawn pairs, in draw order.
    pairs: Vec<Pair>,
    /// The nonparticipant corpus row count `Q`.
    control_candidates: u64,
    /// The `m = min(Q, n)` drawn control rows, in draw order.
    controls: Vec<NodeRowId>,
}

impl Draw {
    /// Takes one generation's draw over its attraction index.
    ///
    /// `rows` is the corpus row count the endpoints index into, and `groups` and `edges` are the
    /// index's regions in file order. [`AttractionFile`] hands out all three. One rule and salt
    /// over one index always produce one draw, so a replay that re-derives the salt re-derives
    /// the selections.
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
        edges: &[EdgeRecord],
    ) -> Result<Self, CensusError> {
        let ranges = edge_ranges(groups, edges)?;

        for (index, record) in edges.iter().enumerate() {
            for row in [record.source.get(), record.target.get()] {
                if row >= rows {
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
            if group.proximal.get() > 0.0 {
                candidates.extend(edges[start..end].iter().map(|record| Pair {
                    source: NodeRowId::new(record.source.get()),
                    target: NodeRowId::new(record.target.get()),
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
/// The complement is the control candidate domain. [`Draw::over`] censuses its control pool from
/// this set, and the evidence writer re-derives it for the collateral strata's candidate sweep,
/// so both walks share one participant definition.
///
/// # Panics
///
/// This panics when an edge names an endpoint at or beyond `rows`. The census's endpoint sweep
/// establishes the bound before either caller arrives here.
pub(super) fn participants(rows: u64, edges: &[EdgeRecord]) -> Box<DenseBitSlice<NodeRowId>> {
    let domain = usize::try_from(rows).expect("a placed corpus fits the address space");
    let mut participants = DenseBitSlice::new_empty(domain);

    for record in edges {
        participants.insert(NodeRowId::new(record.source.get()));
        participants.insert(NodeRowId::new(record.target.get()));
    }

    participants
}

/// Resolves each group's edge range, refusing boundaries the edge region contradicts.
///
/// Group `i` spans `first_edge[i] .. first_edge[i + 1]`, with the final group ending at the edge
/// count. A backwards boundary or one past the region has no consistent reading, so the census
/// refuses it rather than walking a range the file cannot hold.
fn edge_ranges(
    groups: &[GroupRecord],
    edges: &[EdgeRecord],
) -> Result<Vec<(usize, usize)>, CensusError> {
    let edge_count = edges.len() as u64;
    let mut ranges = Vec::with_capacity(groups.len());
    for (group, record) in groups.iter().enumerate() {
        let start = record.first_edge.get();
        let end = groups
            .get(group + 1)
            .map_or(edge_count, |next| next.first_edge.get());
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
/// A bounded max-heap carries the running selection: a candidate below the current worst
/// replaces it, so the walk streams its domain while scratch stays proportional to the quota.
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
