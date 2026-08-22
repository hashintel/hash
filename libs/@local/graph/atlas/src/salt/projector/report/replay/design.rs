//! The inputs one replay is asked to run under and their validation into runnable designs.

use alloc::borrow::Cow;
use core::num::NonZero;

use super::{draw::DrawnSamples, error::ReplayError};
use crate::{file::generation::Generation, salt::quality::metric::NeighbourhoodAggregate};

// The defaults mirror the quality suite's probe: 256 queries against
// the suite's anchor count, 4,096 comparisons and the same
// neighbourhood sizes and horizon factor, so a replay reading and a
// suite reading sit on comparable normalizers.
const DEFAULT_QUERIES: NonZero<usize> =
    NonZero::new(256).expect("the default query count is nonzero");
const DEFAULT_COMPARISONS: NonZero<usize> =
    NonZero::new(4096).expect("the default comparison count is nonzero");
const DEFAULT_CONTROLS: NonZero<usize> =
    NonZero::new(256).expect("the default control count is nonzero");
const DEFAULT_NEIGHBOURHOODS: &[NonZero<usize>] = &[
    NonZero::new(15).expect("the default neighbourhood sizes are nonzero"),
    NonZero::new(30).expect("the default neighbourhood sizes are nonzero"),
    NonZero::new(50).expect("the default neighbourhood sizes are nonzero"),
];
const DEFAULT_HORIZON_FACTOR: NonZero<usize> =
    NonZero::new(2).expect("the default horizon factor is nonzero");

/// Sampling and neighbourhood settings for one replay.
///
/// Each size applies to both estimands: the entity estimand draws that many rows and the class
/// estimand that many byte-exact representation classes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ReplaySizes {
    /// Sampled arrival queries.
    ///
    /// A population smaller than this is sampled whole, and the report records the actual count.
    pub queries: NonZero<usize> = DEFAULT_QUERIES,
    /// Sampled stable comparisons: the shared universe every query ranks.
    pub comparisons: NonZero<usize> = DEFAULT_COMPARISONS,
    /// Sampled fitted controls, disjoint from the comparison universe.
    pub controls: NonZero<usize> = DEFAULT_CONTROLS,
    /// Neighbourhood sizes to read at, in reporting order.
    pub neighbourhoods: Cow<'static, [NonZero<usize>]> = Cow::Borrowed(DEFAULT_NEIGHBOURHOODS),
    /// Horizon multiplier for the intrusion and extrusion readings.
    ///
    /// A false neighbour counts as an intrusion or extrusion when its 1-based opposite-space rank
    /// passes `factor · k`, clamped to the universe.
    pub horizon_factor: NonZero<usize> = DEFAULT_HORIZON_FACTOR,
}

const impl Default for ReplaySizes {
    fn default() -> Self {
        Self { .. }
    }
}

/// One replay's generation pair with the seeded sampling design it reads them under.
#[derive(Debug)]
pub(crate) struct ReplayInputs<'pair> {
    /// The earlier generation `G0`, whose publish path the replay drives.
    pub earlier: &'pair Generation,
    /// The later generation `G1`, whose arrivals the replay samples.
    pub later: &'pair Generation,
    /// The sampling seed. Equal seeds replay the sampling.
    pub seed: u64,
    /// The design sizes.
    pub sizes: ReplaySizes,
}

/// One neighbourhood size's validated design.
///
/// Construction is the validation: each empty aggregate is built here once against its
/// universe, and every pass clones a template instead of revalidating the triple. The estimand
/// template serves both estimands, because the entity and class universes come from one joint
/// draw of `comparisons` members each, so they share one cardinality.
#[expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]
pub(super) struct NeighbourhoodDesign {
    /// The neighbourhood size.
    k: NonZero<usize>,
    /// The empty aggregate over the shared estimand-universe cardinality.
    estimand: NeighbourhoodAggregate,
    /// The empty aggregate over the deduplicated diagnostic universe.
    dedup: NeighbourhoodAggregate,
}

#[expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]
impl NeighbourhoodDesign {
    /// Validates one neighbourhood size against the estimand and diagnostic universes.
    ///
    /// Each horizon is `min(factor · k, universe)` over its own universe.
    ///
    /// # Errors
    ///
    /// Returns [`ReplayError::NeighbourhoodDesign`] naming the first universe that cannot host
    /// the size, the estimand universe checked first.
    pub(super) fn new(
        k: NonZero<usize>,
        universe: usize,
        dedup: usize,
        factor: NonZero<usize>,
    ) -> Result<Self, ReplayError> {
        let aggregate = |universe: usize| {
            NeighbourhoodAggregate::clamped(universe, k, factor).ok_or(
                ReplayError::NeighbourhoodDesign {
                    neighbourhood: k,
                    universe,
                },
            )
        };

        Ok(Self {
            k,
            estimand: aggregate(universe)?,
            dedup: aggregate(dedup)?,
        })
    }

    /// The neighbourhood size.
    pub(super) const fn k(&self) -> NonZero<usize> {
        self.k
    }

    /// The validated empty aggregate over the shared estimand universe.
    pub(super) const fn estimand(&self) -> &NeighbourhoodAggregate {
        &self.estimand
    }

    /// The validated empty aggregate over the deduplicated diagnostic universe.
    pub(super) const fn dedup(&self) -> &NeighbourhoodAggregate {
        &self.dedup
    }

    /// Validates every requested neighbourhood size and proves the observation loads fit.
    ///
    /// Each size is checked against the estimand and diagnostic universes. Every universe is
    /// then proved, at its estimand's actual query and control counts, to fit the rank kernel's
    /// integer carriers, so no aggregate the run observes can wrap.
    ///
    /// # Errors
    ///
    /// Returns [`ReplayError::NeighbourhoodDesign`] naming the first universe that cannot host
    /// a size, and [`ReplayError::AggregateCapacityExceeded`] when a load's recomputed products
    /// overflow the kernel's carriers.
    pub(super) fn validated(
        sizes: &ReplaySizes,
        samples: &DrawnSamples,
        dedup: usize,
    ) -> impl IntoIterator<Item = Result<Self, ReplayError>> {
        let universe = samples.universe.len();
        let entity_load = samples.query_draw.len().max(samples.control_pairs.len());
        let class_load = samples
            .class_query_draw
            .len()
            .max(samples.class_controls.len());

        sizes.neighbourhoods.iter().map(move |&size| {
            let design = Self::new(size, universe, dedup, sizes.horizon_factor)?;
            let exceeded =
                |universe: usize, observations: usize| ReplayError::AggregateCapacityExceeded {
                    universe,
                    neighbourhood: size,
                    observations,
                };
            if !design.estimand().supports(entity_load) {
                return Err(exceeded(universe, entity_load));
            }
            if !design.dedup().supports(entity_load) {
                return Err(exceeded(dedup, entity_load));
            }
            if !design.estimand().supports(class_load) {
                return Err(exceeded(samples.class_universe.len(), class_load));
            }

            Ok(design)
        })
    }
}
