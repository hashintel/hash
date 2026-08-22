//! Joining, partitioning, and byte-exact class formation over the generation pair.

use std::collections::{HashMap, HashSet};

use hashql_core::id::{IdSlice, IdVec, bit_vec::DenseBitSet};
use zerocopy::IntoBytes as _;

use super::{Pair, error::ReplayError, extract::GenerationColumns};
use crate::{
    dataset::{PROJECTOR_DIMENSIONS, TemporalAxes},
    identity::{EdgeRowId, NodeRowId},
    math::AlignedVecN,
};

/// Whether an arrival's representation bytes already occur in the earlier generation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Novelty {
    /// The exact bytes occur in `G0`, so the model has seen this input.
    Seen,
    /// The bytes occur nowhere in `G0`: the reading that tests generalization.
    Novel,
}

/// One arrival, a later row absent from the earlier generation.
pub(super) struct Arrival {
    /// The arrival's later-generation row.
    pub later_row: NodeRowId,
    /// Whether the arrival's bytes occur in the earlier generation.
    pub novelty: Novelty,
}

hashql_core::id::newtype! {
    /// An arrival's index within the arrival population.
    #[id(const)]
    pub(super) struct ArrivalIndex(u32)
}

hashql_core::id::newtype! {
    /// A stable pair's index within the stable population.
    #[id(const)]
    pub(super) struct StablePairIndex(u32)
}

hashql_core::id::newtype! {
    /// A class's index within the stable population's byte-exact classes.
    #[id(const)]
    pub(super) struct StableClassIndex(u32)
}

hashql_core::id::newtype! {
    /// A class's index within the arrival population's byte-exact classes.
    #[id(const)]
    pub(super) struct ArrivalClassIndex(u32)
}

/// One stable identity's rows in both generations.
#[derive(Copy, Clone)]
pub(super) struct StablePair {
    /// The identity's earlier-generation row.
    pub earlier_row: NodeRowId,
    /// The identity's later-generation row.
    pub later_row: NodeRowId,
}

/// The joined rows, partitioned.
pub(super) struct Populations {
    /// Arrivals, ascending by later row.
    pub arrivals: IdVec<ArrivalIndex, Arrival>,
    /// Arrivals whose representation bytes occur in the earlier generation.
    pub arrivals_seen: usize,
    /// Stable pairs, ascending by later row.
    pub stable: IdVec<StablePairIndex, StablePair>,
    /// Identities present in both generations with differing representation bytes.
    pub revised: usize,
}

/// One byte-exact representation class of the stable population.
///
/// The representative is the class's lowest-later-row member: a deterministic rule, independent
/// of any draw.
#[derive(Copy, Clone)]
pub(super) struct StableClass {
    /// The representative member's rows.
    pub representative: StablePair,
    /// The class's member count.
    pub members: usize,
}

/// One byte-exact representation class of the arrival population.
///
/// The representative is the class's lowest-later-row member: a deterministic rule, independent
/// of any draw. Byte-equal arrivals share their novelty by construction, so the class carries it
/// whole.
#[derive(Copy, Clone)]
pub(super) struct ArrivalClass {
    /// The representative member's later-generation row.
    pub representative_row: NodeRowId,
    /// The class's shared novelty.
    pub novelty: Novelty,
    /// The class's member count.
    pub members: usize,
}

impl Populations {
    /// Joins the two generations' rows by entity identity and partitions them.
    pub(super) fn new(Pair { earlier, later }: &Pair<GenerationColumns<'_>>) -> Self {
        let mut earlier_rows = HashMap::with_capacity(earlier.ids().len());
        for (row, id) in earlier.ids().iter_enumerated() {
            earlier_rows.insert(*id, row);
        }

        let mut earlier_classes = HashSet::with_capacity(earlier.representations().len());
        for representation in earlier.representations() {
            earlier_classes.insert(representation.as_bytes());
        }

        let mut populations = Self {
            arrivals: IdVec::new(),
            arrivals_seen: 0,
            stable: IdVec::new(),
            revised: 0,
        };

        for (later_row, id) in later.ids().iter_enumerated() {
            let bytes = later.representations()[later_row].as_bytes();
            if let Some(&earlier_row) = earlier_rows.get(id) {
                if earlier.representations()[earlier_row].as_bytes() == bytes {
                    populations.stable.push(StablePair {
                        earlier_row,
                        later_row,
                    });
                } else {
                    populations.revised += 1;
                }
            } else {
                let novelty = if earlier_classes.contains(bytes) {
                    populations.arrivals_seen += 1;
                    Novelty::Seen
                } else {
                    Novelty::Novel
                };
                populations.arrivals.push(Arrival { later_row, novelty });
            }
        }

        populations
    }

    /// Forms the byte-exact representation classes of the whole stable population.
    ///
    /// Ascending iteration makes each representative its class's lowest later row, and the
    /// returned classes ascend by representative row.
    pub(super) fn stable_classes(
        &self,
        representations: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    ) -> IdVec<StableClassIndex, StableClass> {
        let mut class_of_bytes: HashMap<&[u8], StableClassIndex> = HashMap::new();
        let mut classes: IdVec<StableClassIndex, StableClass> = IdVec::new();

        for &pair in &self.stable {
            let bytes = representations[pair.later_row].as_bytes();

            if let Some(&class) = class_of_bytes.get(bytes) {
                classes[class].members += 1;
            } else {
                let class = classes.push(StableClass {
                    representative: pair,
                    members: 1,
                });
                class_of_bytes.insert(bytes, class);
            }
        }

        classes
    }

    /// Forms the byte-exact representation classes of the whole arrival population.
    ///
    /// Ascending iteration makes each representative its class's lowest later row, and the
    /// returned classes ascend by representative row.
    pub(super) fn arrival_classes(
        &self,
        representations: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    ) -> IdVec<ArrivalClassIndex, ArrivalClass> {
        let mut class_of_bytes: HashMap<&[u8], ArrivalClassIndex> = HashMap::new();
        let mut classes: IdVec<ArrivalClassIndex, ArrivalClass> = IdVec::new();
        for arrival in &self.arrivals {
            let bytes = representations[arrival.later_row].as_bytes();
            match class_of_bytes.get(bytes) {
                None => {
                    let class = classes.push(ArrivalClass {
                        representative_row: arrival.later_row,
                        novelty: arrival.novelty,
                        members: 1,
                    });
                    class_of_bytes.insert(bytes, class);
                }
                Some(&class) => classes[class].members += 1,
            }
        }

        classes
    }
}

impl Pair<GenerationColumns<'_>> {
    /// Checks both generations record axes and the earlier strictly precedes the later.
    ///
    /// # Errors
    ///
    /// Returns [`ReplayError::UnrecordedTemporalAxes`] naming the first generation without
    /// recorded axes, and [`ReplayError::OrderViolation`] when the earlier generation does not
    /// strictly precede the later.
    pub(super) fn validated_order(&self) -> Result<Pair<TemporalAxes>, ReplayError> {
        let earlier = self
            .earlier
            .axes()
            .ok_or_else(|| ReplayError::UnrecordedTemporalAxes {
                generation: self.earlier.id(),
            })?;
        let later = self
            .later
            .axes()
            .ok_or_else(|| ReplayError::UnrecordedTemporalAxes {
                generation: self.later.id(),
            })?;

        if earlier.transaction_time >= later.transaction_time {
            return Err(ReplayError::OrderViolation {
                earlier: self.earlier.id(),
                later: self.later.id(),
            });
        }

        Ok(Pair { earlier, later })
    }
}

/// One row's incident-edge readings.
#[derive(Debug, Copy, Clone, Default)]
pub(super) struct IncidentStats {
    /// Incident edges of the row in the later generation.
    pub degree: u64,
    /// Incident edges whose opposite endpoint is a stable row.
    pub stable_incident: u64,
}

impl IncidentStats {
    /// Reads the incident-edge diagnostics of the named rows in one pass over the edges.
    ///
    /// A self-referential edge counts once. The opposite endpoint is read against the whole
    /// stable partition class.
    pub(super) fn of_rows(
        rows_of_interest: impl IntoIterator<Item = NodeRowId>,
        edges: &IdSlice<EdgeRowId, [NodeRowId; 2]>,
        stable: &IdSlice<StablePairIndex, StablePair>,
        corpus_rows: usize,
    ) -> HashMap<NodeRowId, Self> {
        let mut stable_rows = DenseBitSet::new_empty(corpus_rows);
        for pair in stable {
            stable_rows.insert(pair.later_row);
        }

        let mut stats: HashMap<NodeRowId, Self> = rows_of_interest
            .into_iter()
            .map(|row| (row, Self::default()))
            .collect();

        for &[source, target] in edges {
            // A self-referential edge is incident once, so it enters once.
            let both = [(source, target), (target, source)];
            let ends = if source == target {
                &both[..1]
            } else {
                &both[..]
            };
            for &(this, opposite) in ends {
                if let Some(row_stats) = stats.get_mut(&this) {
                    row_stats.degree += 1;
                    if stable_rows.contains(opposite) {
                        row_stats.stable_incident += 1;
                    }
                }
            }
        }

        stats
    }
}
