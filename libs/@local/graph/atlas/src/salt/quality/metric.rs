//! Rank-based fidelity kernels over a shared comparison universe.
//!
//! Every kernel here consumes neighbour orderings, never coordinates: a query's view of the
//! universe is a permutation of `0..m` listing the comparison points from nearest to farthest, one
//! permutation per space. Which spaces produced the orderings - the 2D map against the
//! 512-component representation, either against exact canonical distances - is the orchestration's
//! concern, so one set of kernels serves every space pair the suite reports.
//!
//! For a query with reference ordering `R` and map ordering `M`, the per-query quantities at
//! neighbourhood size `k` are:
//!
//! - shared neighbours: `|R_k intersect M_k|`, where `X_k` is the ordering's first `k` points;
//!   recall at `k` is the shared count over `k`.
//! - trust penalty: `sum (rank_R(j) - k)` over the map neighbours `j in M_k \ R_k`, with ranks
//!   1-based - how far into the reference ordering the map's false neighbours live.
//! - continuity penalty: the mirror image, `sum (rank_M(j) - k)` over `j in R_k \ M_k` - how far
//!   the map banishes true neighbours.
//! - intrusions and extrusions: the false neighbours whose rank excess passes a configured horizon,
//!   separating foreign points from near-boundary reshuffling among close ranks.
//!
//! [`NeighbourhoodAggregate`] accumulates these over queries and normalizes trustworthiness and
//! continuity onto `[0, 1]` (1 is a perfect map, 0 the worst permutation) by the worst-case penalty
//! `q · k · (2m - 3k + 1) / 2`: each of `q` queries can misplace at most `k` points, and their rank
//! excesses are largest when the false neighbours occupy the ordering's final `k` positions. Over a
//! universe of `m = n - 1` non-self points this reduces to the Venna-Kaski normalization `2 / (n k
//! (2n - 3k - 1))`.
#![expect(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    reason = "probe universes, neighbourhood sizes, and query counts are bounded orders of \
              magnitude below both u32 and the f64 mantissa"
)]
#![expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]

use core::num::NonZero;

use crate::math::UnitFraction;

/// Reusable inverse-rank buffers for one comparison universe.
///
/// Sized once per universe; [`NeighbourhoodAggregate::observe`] fills both buffers per query, so a
/// suite pass allocates two `u32` rows regardless of query count.
pub(crate) struct RankScratch {
    reference_rank: Vec<u32>,
    map_rank: Vec<u32>,
}

impl RankScratch {
    /// Creates scratch for a universe of `universe` comparison points.
    #[must_use]
    pub(crate) fn new(universe: usize) -> Self {
        Self {
            reference_rank: vec![0; universe],
            map_rank: vec![0; universe],
        }
    }
}

/// Accumulated neighbourhood agreement between two orderings.
///
/// One aggregate fixes a universe size, a neighbourhood size, and an intrusion horizon at
/// construction; queries accumulate through [`observe`](Self::observe) and the metric readings
/// divide the totals on demand. An aggregate over a single query is that query's own reading.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct NeighbourhoodAggregate {
    universe: usize,
    k: usize,
    horizon: usize,
    queries: usize,
    shared: u64,
    intrusions: u64,
    extrusions: u64,
    trust_penalty: u64,
    continuity_penalty: u64,
}

impl NeighbourhoodAggregate {
    /// Creates an empty aggregate.
    ///
    /// `universe` is the comparison-point count every observed ordering permutes; `k` the
    /// neighbourhood size; `horizon` the 1-based rank beyond which a false neighbour counts as an
    /// intrusion or extrusion rather than a reshuffle.
    ///
    /// Returns [`None`] unless `k ≤ universe / 2` (the trustworthiness normalizer is positive on
    /// this domain) and `k ≤ horizon ≤ universe`.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the k bound is deliberately the floor of half the universe"
    )]
    #[must_use]
    pub(crate) const fn new(universe: usize, k: NonZero<usize>, horizon: usize) -> Option<Self> {
        let k = k.get();
        if k > universe / 2 {
            return None;
        }

        if horizon < k || horizon > universe {
            return None;
        }

        Some(Self {
            universe,
            k,
            horizon,
            queries: 0,
            shared: 0,
            intrusions: 0,
            extrusions: 0,
            trust_penalty: 0,
            continuity_penalty: 0,
        })
    }

    /// Creates an empty aggregate at the clamped intrusion horizon.
    ///
    /// The mathematical horizon is `min(factor · k, universe)`. When the product exceeds
    /// `usize`, it exceeds the universe as well, so the clamp is the universe.
    #[must_use]
    pub(crate) const fn clamped(
        universe: usize,
        k: NonZero<usize>,
        factor: NonZero<usize>,
    ) -> Option<Self> {
        let product = k.get().saturating_mul(factor.get());
        let horizon = if product < universe {
            product
        } else {
            universe
        };

        Self::new(universe, k, horizon)
    }

    /// Proves the aggregate's integer carriers hold `observations` queries' worst-case penalties.
    ///
    /// Take `m` as the aggregate's universe and `k` its neighbourhood size. Penalties accumulate
    /// into `u64` totals and read back through `usize` products. The recomputed products are the
    /// doubled universe `2m` and the worst-case per-query penalty product `k·(2m − 3k + 1)`
    /// before its exact halving into `worst`, then the pair count `q·k` and the normalizer
    /// `q·worst` at `q = observations`. Each is checked with the carrier's own width, so an
    /// accepted load cannot wrap on either target width. The checked normalizer also bounds the
    /// `u64` penalty totals, and `usize` never exceeds `u64`. The worst case assumes each
    /// observation ranks `k` distinct reference positions, which every observed ordering
    /// satisfies: an ordering is a permutation, so one query's `k` opposite ranks are distinct.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "k and (2m - 3k + 1) never share odd parity, so halving the worst-case penalty \
                  is exact"
    )]
    #[must_use]
    pub(crate) fn supports(&self, observations: usize) -> bool {
        let Some(doubled) = self.universe.checked_mul(2) else {
            return false;
        };
        let span = self
            .k
            .checked_mul(3)
            .and_then(|tripled| doubled.checked_sub(tripled - 1))
            .expect(
                "construction bounds the neighbourhood within half the universe, so the span \
                 arithmetic cannot overflow or underflow",
            );
        let Some(worst) = self.k.checked_mul(span) else {
            return false;
        };
        let worst = worst / 2;

        observations.checked_mul(self.k).is_some() && observations.checked_mul(worst).is_some()
    }

    /// Accumulates one query's pair of orderings.
    ///
    /// Each slice lists the universe's points nearest-first in its space and must be a permutation
    /// of `0..universe`; the query itself is not a universe point, so neither ordering lists it.
    ///
    /// # Panics
    ///
    /// This panics when either ordering's length differs from the universe or names a point outside
    /// it.
    pub(crate) fn observe(
        &mut self,
        by_reference: &[u32],
        by_map: &[u32],
        scratch: &mut RankScratch,
    ) {
        assert_eq!(
            by_reference.len(),
            self.universe,
            "the reference ordering must cover the universe",
        );
        assert_eq!(
            by_map.len(),
            self.universe,
            "the map ordering must cover the universe",
        );

        for (rank, (&reference, &map)) in by_reference.iter().zip(by_map).enumerate() {
            scratch.reference_rank[reference as usize] = rank as u32;
            scratch.map_rank[map as usize] = rank as u32;
        }

        self.accumulate(
            by_map[..self.k]
                .iter()
                .map(|&neighbour| scratch.reference_rank[neighbour as usize]),
            by_reference[..self.k]
                .iter()
                .map(|&neighbour| scratch.map_rank[neighbour as usize]),
        );
    }

    /// Accumulates one query from each neighbourhood's opposite ranks.
    ///
    /// `reference_ranks_of_map_neighbours` holds the reference-space ranks of the query's `k`
    /// nearest map points, nearest-first, and `map_ranks_of_reference_neighbours` the mirror image;
    /// ranks are 0-based positions in the universe. The metrics are functions of exactly these `2k`
    /// ranks, so a caller that computes ranks by counting - without materializing whole orderings -
    /// observes through here and [`observe`](Self::observe) reduces to it.
    ///
    /// # Panics
    ///
    /// This panics when either slice's length differs from `k` or a rank lies outside the universe.
    pub(crate) fn observe_ranks(
        &mut self,
        reference_ranks_of_map_neighbours: &[u32],
        map_ranks_of_reference_neighbours: &[u32],
    ) {
        assert_eq!(
            reference_ranks_of_map_neighbours.len(),
            self.k,
            "the map neighbourhood must hold exactly k ranks",
        );
        assert_eq!(
            map_ranks_of_reference_neighbours.len(),
            self.k,
            "the reference neighbourhood must hold exactly k ranks",
        );

        self.accumulate(
            reference_ranks_of_map_neighbours.iter().copied(),
            map_ranks_of_reference_neighbours.iter().copied(),
        );
    }

    /// Folds one query's opposite-rank pairs into the totals.
    fn accumulate(
        &mut self,
        reference_ranks_of_map_neighbours: impl Iterator<Item = u32>,
        map_ranks_of_reference_neighbours: impl Iterator<Item = u32>,
    ) {
        // Positions are 0-based; the 1-based excess (rank - k) of a
        // position p is (p - k) + 1.
        for rank in reference_ranks_of_map_neighbours {
            let reference_position = rank as usize;
            assert!(
                reference_position < self.universe,
                "a rank must name a position inside the universe",
            );

            if reference_position < self.k {
                self.shared += 1;
                continue;
            }

            self.trust_penalty += (reference_position - self.k + 1) as u64;
            if reference_position >= self.horizon {
                self.intrusions += 1;
            }
        }

        for rank in map_ranks_of_reference_neighbours {
            let map_position = rank as usize;
            assert!(
                map_position < self.universe,
                "a rank must name a position inside the universe",
            );

            if map_position < self.k {
                continue;
            }

            self.continuity_penalty += (map_position - self.k + 1) as u64;
            if map_position >= self.horizon {
                self.extrusions += 1;
            }
        }

        self.queries += 1;
    }

    /// Folds another aggregate's observations into this one.
    ///
    /// Merging aggregates observed over disjoint query sets equals one aggregate observing their
    /// union, so per-query aggregates roll up into per-subgroup readings and a reading over every
    /// query without revisiting orderings.
    ///
    /// # Panics
    ///
    /// This panics when the aggregates disagree about the universe, the neighbourhood size, or the
    /// horizon. Totals combine only across readings normalized against the same shape.
    pub(crate) fn merge(&mut self, other: &Self) {
        assert!(
            self.universe == other.universe && self.k == other.k && self.horizon == other.horizon,
            "merged aggregates must share the universe, neighbourhood size, and horizon",
        );

        self.queries += other.queries;
        self.shared += other.shared;
        self.intrusions += other.intrusions;
        self.extrusions += other.extrusions;
        self.trust_penalty += other.trust_penalty;
        self.continuity_penalty += other.continuity_penalty;
    }

    /// Returns the observed query count.
    #[inline]
    #[must_use]
    pub(crate) const fn queries(&self) -> usize {
        self.queries
    }

    /// Returns the comparison-point count every ordering permutes.
    #[inline]
    #[must_use]
    pub(crate) const fn universe(&self) -> usize {
        self.universe
    }

    /// Returns the mean fraction of shared k-neighbourhoods, in `[0, 1]`.
    ///
    /// An empty aggregate reads 1.
    #[must_use]
    pub(crate) fn recall(&self) -> UnitFraction {
        let Some(pairs) = self.pairs() else {
            return UnitFraction::ONE;
        };

        UnitFraction::new_unchecked(self.shared as f64 / pairs)
    }

    /// Returns the fraction of map neighbours past the horizon in the reference ordering.
    ///
    /// The rate lies in `[0, 1]`, and an empty aggregate reads 0.
    #[must_use]
    pub(crate) fn intrusion_rate(&self) -> UnitFraction {
        let Some(pairs) = self.pairs() else {
            return UnitFraction::ZERO;
        };

        UnitFraction::new_unchecked(self.intrusions as f64 / pairs)
    }

    /// Returns the fraction of reference neighbours past the horizon in the map ordering.
    ///
    /// The rate lies in `[0, 1]`, and an empty aggregate reads 0.
    #[must_use]
    pub(crate) fn extrusion_rate(&self) -> UnitFraction {
        let Some(pairs) = self.pairs() else {
            return UnitFraction::ZERO;
        };

        UnitFraction::new_unchecked(self.extrusions as f64 / pairs)
    }

    /// Returns the trustworthiness reading, in `[0, 1]`.
    ///
    /// An empty aggregate reads 1.
    #[must_use]
    pub(crate) fn trustworthiness(&self) -> UnitFraction {
        self.normalized(self.trust_penalty)
    }

    /// Returns the continuity reading, in `[0, 1]`.
    ///
    /// An empty aggregate reads 1.
    #[must_use]
    pub(crate) fn continuity(&self) -> UnitFraction {
        self.normalized(self.continuity_penalty)
    }

    /// Returns the observed neighbour-pair count, [`None`] when empty.
    const fn pairs(&self) -> Option<f64> {
        if self.queries == 0 {
            return None;
        }

        Some((self.queries * self.k) as f64)
    }

    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "k and (2m - 3k + 1) never share odd parity, so halving the worst-case penalty \
                  is exact"
    )]
    fn normalized(&self, penalty: u64) -> UnitFraction {
        if self.queries == 0 {
            return UnitFraction::ONE;
        }

        // The constructor bounds k ≤ universe / 2, so 2m - 3k + 1 > 0.
        let worst_per_query = self.k * (2 * self.universe - 3 * self.k + 1) / 2;
        UnitFraction::new_unchecked(1.0 - penalty as f64 / (self.queries * worst_per_query) as f64)
    }
}

/// Accumulated order agreement over sampled triplets.
///
/// A triplet fixes an anchor and two comparison points, and the map preserves that triplet when it
/// orders the points' distances from the anchor as the reference space does, both spaces compared
/// under the shared `(distance, row)` total order - a pair coincident in both spaces is therefore
/// preserved, and one coincident in exactly one space is not. An aggregate over one anchor's pairs
/// is that anchor's own reading.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub(crate) struct TripletAggregate {
    triplets: u64,
    preserved: u64,
}

impl TripletAggregate {
    /// Accumulates one triplet's verdict.
    #[inline]
    pub(crate) const fn observe(&mut self, preserved: bool) {
        self.triplets += 1;
        self.preserved += preserved as u64;
    }

    /// Folds another aggregate's observations into this one.
    #[inline]
    pub(crate) const fn merge(&mut self, other: &Self) {
        self.triplets += other.triplets;
        self.preserved += other.preserved;
    }

    /// Returns the observed triplet count.
    #[inline]
    #[must_use]
    pub(crate) const fn triplets(&self) -> u64 {
        self.triplets
    }

    /// Returns the preserved triplet count.
    #[inline]
    #[must_use]
    pub(crate) const fn preserved(&self) -> u64 {
        self.preserved
    }

    /// Returns the preserved fraction.
    ///
    /// An empty aggregate reads one.
    #[must_use]
    pub(crate) fn agreement(&self) -> UnitFraction {
        if self.triplets == 0 {
            return UnitFraction::ONE;
        }

        // Preservation only ever counts a subset of the observed triplets,
        // so the ratio lies ∈ [0, 1] by construction.
        UnitFraction::new_unchecked(self.preserved as f64 / self.triplets as f64)
    }
}
