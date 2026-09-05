//! The seeded sampling draws over the partitioned populations.

use std::collections::HashSet;

use hashql_core::id::{IdSlice, IdVec};
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;
use zerocopy::IntoBytes as _;

use super::{
    error::ReplayError,
    population::{
        ArrivalClass, ArrivalClassIndex, ArrivalIndex, Populations, StableClass, StableClassIndex,
        StablePair,
    },
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    identity::NodeRowId,
    integrity::{Sha256, Update as _},
    math::AlignedVecN,
    random::sample_ids,
};

hashql_core::id::newtype! {
    /// A position within the entity estimand's sampled comparison universe.
    #[id(const)]
    pub(super) struct UniversePosition(u32)
}

hashql_core::id::newtype! {
    /// A position within the class estimand's sampled comparison universe.
    #[id(const)]
    pub(super) struct ClassUniversePosition(u32)
}

hashql_core::id::newtype! {
    /// A position within the deduplication diagnostic's representative list.
    #[id(const)]
    pub(super) struct DedupPosition(u32)
}

/// The sampling and neighbourhood settings one replay was asked for.
pub(super) struct DrawSizes {
    /// The requested arrival query sample, per estimand.
    pub queries: usize,
    /// The requested comparison universe sample, per estimand.
    pub comparisons: usize,
    /// The requested control sample, per estimand.
    pub controls: usize,
}

/// The seeded draws of both estimands.
pub(super) struct DrawnSamples {
    /// Sampled arrival indices, ascending.
    pub query_draw: Vec<ArrivalIndex>,
    /// The entity comparison universe, ascending by later row.
    pub universe: IdVec<UniversePosition, StablePair>,
    /// The entity controls, disjoint from the universe, ascending by later row.
    pub control_pairs: Vec<StablePair>,
    /// Sampled arrival-class indices, ascending.
    pub class_query_draw: Vec<ArrivalClassIndex>,
    /// The class comparison universe, ascending by representative row.
    pub class_universe: IdVec<ClassUniversePosition, StableClass>,
    /// The class controls, disjoint from the class universe, ascending by representative row.
    pub class_controls: Vec<StableClass>,
}

impl DrawnSamples {
    /// Derives the replay's generator from the sampling seed.
    ///
    /// The pinned name keeps the derivation disjoint from every other seeded consumer's, so a
    /// replay and a fit sharing a seed value still draw independently.
    #[expect(
        clippy::little_endian_bytes,
        reason = "the derivation preimage pins the canonical little-endian bytes"
    )]
    fn replay_rng(seed: u64) -> Xoshiro256PlusPlus {
        let mut hasher = Sha256::new();
        hasher.update(&seed.to_le_bytes());
        hasher.update(b"arrival-replay");

        Xoshiro256PlusPlus::from_seed(hasher.finalize().to_bytes())
    }

    /// Draws every sample of both estimands under the seed.
    ///
    /// The draw order is pinned, so equal seeds replay the whole design. Entity queries draw
    /// first and the joint entity universe-and-control draw follows. The class draws repeat that
    /// order. Each estimand's universe and controls come from one joint draw whose first
    /// `comparisons` indices are the universe and whose rest are the controls, which is what
    /// makes the two disjoint. Classes enter their draw with equal weight, one index per class,
    /// so member multiplicity buys a class no extra chance.
    ///
    /// # Errors
    ///
    /// Returns [`ReplayError::InsufficientStableRows`] when the stable population cannot host
    /// the joint entity draw, and [`ReplayError::InsufficientStableClasses`] when its
    /// representation classes cannot host the joint class draw. A joint request beyond `usize`
    /// is refused as insufficient, because no population can host it.
    pub(super) fn new(
        seed: u64,
        populations: &Populations,
        classes: &IdSlice<StableClassIndex, StableClass>,
        arrival_classes: &IdSlice<ArrivalClassIndex, ArrivalClass>,
        &DrawSizes {
            queries,
            comparisons,
            controls,
        }: &DrawSizes,
    ) -> Result<Self, ReplayError> {
        let Some(joint) = comparisons
            .checked_add(controls)
            .filter(|&joint| populations.stable.len() >= joint)
        else {
            return Err(ReplayError::InsufficientStableRows {
                stable: populations.stable.len(),
                comparisons,
                controls,
            });
        };
        if classes.len() < joint {
            return Err(ReplayError::InsufficientStableClasses {
                classes: classes.len(),
                comparisons,
                controls,
            });
        }

        let mut rng = Self::replay_rng(seed);

        let query_count = queries.min(populations.arrivals.len());
        let mut query_draw: Vec<_> =
            sample_ids(&mut rng, &populations.arrivals, query_count).collect();
        query_draw.sort_unstable();

        let mut shared_draw: Vec<_> = sample_ids(&mut rng, &populations.stable, joint).collect();
        let mut control_draw = shared_draw.split_off(comparisons);
        shared_draw.sort_unstable();
        control_draw.sort_unstable();

        let class_query_count = queries.min(arrival_classes.len());
        let mut class_query_draw: Vec<_> =
            sample_ids(&mut rng, arrival_classes, class_query_count).collect();
        class_query_draw.sort_unstable();

        let mut class_shared_draw: Vec<_> = sample_ids(&mut rng, classes, joint).collect();
        let mut class_control_draw = class_shared_draw.split_off(comparisons);
        class_shared_draw.sort_unstable();
        class_control_draw.sort_unstable();

        Ok(Self {
            query_draw,
            universe: shared_draw
                .iter()
                .map(|&index| populations.stable[index])
                .collect(),
            control_pairs: control_draw
                .iter()
                .map(|&index| populations.stable[index])
                .collect(),
            class_query_draw,
            class_universe: class_shared_draw
                .iter()
                .map(|&index| classes[index])
                .collect(),
            class_controls: class_control_draw
                .iter()
                .map(|&index| classes[index])
                .collect(),
        })
    }

    /// The deduplication diagnostic's membership within the sampled entity universe.
    ///
    /// Each position names the universe member representing one byte-exact representation
    /// class. Ascending iteration makes each representative its class's lowest universe
    /// position, hence its lowest later row within the draw.
    pub(super) fn dedup_representatives(
        &self,
        representations: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    ) -> impl IntoIterator<Item = UniversePosition> {
        let mut seen_classes = HashSet::new();

        self.universe
            .iter_enumerated()
            .filter_map(move |(position, member)| {
                seen_classes
                    .insert(representations[member.later_row].as_bytes())
                    .then_some(position)
            })
    }
}
