//! Rank-based fidelity kernels over a shared comparison universe.
//!
//! A query's view of a comparison universe is a permutation of `0..m` listing its points
//! nearest-first, one permutation per space. The neighbourhood kernels consume these orderings or
//! the opposite ranks of their nearest points. Triplet aggregation consumes order-agreement
//! verdicts. The same kernels serve every space pair independently of its coordinate
//! representation.
//!
//! For reference ordering R and map ordering M over m points, let Xₖ be the first k points of X,
//! with integer 1 ≤ k ≤ ⌊m/2⌋. Use one-based ranks rᵣ and rₘ and a horizon h with k ≤ h ≤ m. The
//! per-query quantities are:
//!
//! - Shared neighbours: |Rₖ ∩ Mₖ|. Recall divides this count by k.
//! - Trust penalty: Σ(rᵣ(j) − k) over j ∈ Mₖ ∖ Rₖ, measuring how far false map neighbours rank
//!   beyond the reference neighbourhood.
//! - Continuity penalty: Σ(rₘ(j) − k) over j ∈ Rₖ ∖ Mₖ, measuring how far missing reference
//!   neighbours rank beyond the map neighbourhood.
//! - Intrusions: map neighbours with rᵣ(j) > h. Extrusions: reference neighbours with rₘ(j) > h.
//!   Each rate divides its count by k.
//!
//! Distinct opposite ranks maximize either penalty at the final k positions of the universe. Their
//! excesses sum to W = k · (2m − 3k + 1) / 2. The bound k ≤ ⌊m/2⌋ makes those positions disjoint
//! from the reference neighbourhood. Therefore W is the attainable worst per-query penalty, and
//! [`NeighbourhoodAggregate`] computes trustworthiness and continuity as 1 − P/(q · W) for q > 0
//! queries with total penalty P. The readings lie in [0, 1], with one at zero penalty and zero at
//! the worst case. With q = n queries and m = n − 1 comparisons per query, the coefficient becomes
//! the Venna-Kaski normalization 2 / (n · k · (2n − 3k − 1)).
//!
//! Integer counts preserve exact aggregation order-independence while their carriers hold the
//! totals. [`NeighbourhoodAggregate::supports`] checks the count and normalization capacity for a
//! proposed total query count, but observation does not enforce that check. Conversion and division
//! round to f64. For the same valid rank inputs and supported totals, merge order leaves the
//! readings unchanged.
#![expect(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    reason = "rank positions must fit u32. Integer totals may round when converted to f64"
)]
#![expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]

use core::num::NonZero;

use crate::math::UnitFraction;

/// Reusable inverse-rank buffers for one comparison universe.
///
/// Allocate for one universe and reuse across observations. Each buffer holds one u32 rank per
/// comparison point.
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
/// construction. Queries accumulate through [`observe`](Self::observe) and the metric readings
/// divide the totals on demand. An aggregate over a single query is that query's own reading.
///
/// Observations must describe valid permutations with u32 rank positions. Before accumulating or
/// merging, ensure [`supports`](Self::supports) accepts the resulting total query count. These are
/// correctness requirements, not checks performed by observation. The shape constructor alone does
/// not establish arithmetic capacity.
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
    /// `universe` is the comparison-point count every observed ordering permutes. `k` is the
    /// neighbourhood size, and `horizon` is the one-based rank beyond which a false neighbour
    /// counts as an intrusion or extrusion.
    ///
    /// Returns [`None`] unless k ≤ ⌊universe/2⌋ and k ≤ horizon ≤ universe. On this domain the k
    /// largest rank excesses are attainable together and the normalizer is positive.
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
    /// The mathematical horizon is min(factor · k, universe). Saturating the product before
    /// clamping preserves that value: a product exceeding usize also exceeds the universe. Returns
    /// [`None`] when [`new`](Self::new) rejects the neighbourhood shape.
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

    /// Checks arithmetic capacity for `observations` total queries.
    ///
    /// For universe m, neighbourhood k and total query count q, the worst per-query penalty is W =
    /// k · (2m − 3k + 1)/2. This check verifies that 2m, the unhalved penalty product, q · k and q
    /// · W all fit usize. On 32-bit and 64-bit targets, q · W also bounds the u64 penalty totals.
    /// Therefore these products and totals cannot wrap for an accepted load of valid observations.
    ///
    /// The bound assumes k distinct opposite ranks from valid permutations, including through
    /// [`observe_ranks`](Self::observe_ranks). It validates no observation and reserves no
    /// capacity.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "k and (2m - 3k + 1) never share odd parity. Halving their even product is exact"
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
                "construction bounds the neighbourhood within half the universe. The doubled \
                 universe already fits usize. The span arithmetic cannot overflow or underflow",
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
    /// of `0..universe`. The query itself is not a universe point. `scratch` must have been created
    /// for this same universe, and the resulting total query count must satisfy
    /// [`supports`](Self::supports).
    ///
    /// # Panics
    ///
    /// Panics when an ordering's length differs from the universe, a point lies outside the scratch
    /// storage, or an accumulated rank lies outside the universe. With correctly sized scratch,
    /// every out-of-universe point fails the storage bound.
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
    /// `reference_ranks_of_map_neighbours` holds the reference-space ranks of the query's k nearest
    /// map points, and `map_ranks_of_reference_neighbours` holds the map-space ranks of its k
    /// nearest reference points. Ranks are zero-based positions in the universe. Each slice must
    /// contain distinct ranks derived from the same pair of valid orderings, and the resulting
    /// total query count must satisfy [`supports`](Self::supports).
    ///
    /// The metrics depend on exactly these 2k ranks, irrespective of their order within each slice.
    /// Use this form for ranks computed by counting, without materializing whole permutations.
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

    /// Adds one query's opposite-rank counts and penalties to the totals.
    ///
    /// Each iterator must supply k distinct ranks from the same pair of orderings, within the
    /// aggregate's supported query load.
    ///
    /// # Panics
    ///
    /// Panics when a rank is outside the universe.
    fn accumulate(
        &mut self,
        reference_ranks_of_map_neighbours: impl Iterator<Item = u32>,
        map_ranks_of_reference_neighbours: impl Iterator<Item = u32>,
    ) {
        // for zero-based position p, the one-based rank excess is p − k + 1
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
    /// The resulting total query count must satisfy [`supports`](Self::supports).
    ///
    /// # Properties
    ///
    /// For valid observations with supported totals and equal shapes, merging aggregates equals
    /// observing the concatenation of their queries. A repeated query counts again. Disjoint query
    /// sets yield the reading over their union.
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

    /// Normalizes a supported total penalty, with one at zero penalty.
    ///
    /// The worst case per query is k · (2m − 3k + 1) / 2, the penalty of a neighbourhood whose k
    /// members all rank last among the m comparisons. An empty aggregate reads one. `penalty` must
    /// not exceed the supported total normalizer.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "k and (2m - 3k + 1) never share odd parity. Halving their even product is exact"
    )]
    fn normalized(&self, penalty: u64) -> UnitFraction {
        if self.queries == 0 {
            return UnitFraction::ONE;
        }

        // construction gives 2m − 3k + 1 > 0. The supports precondition establishes that the
        // products fit
        let worst_per_query = self.k * (2 * self.universe - 3 * self.k + 1) / 2;
        UnitFraction::new_unchecked(1.0 - penalty as f64 / (self.queries * worst_per_query) as f64)
    }
}

/// Accumulated order agreement over sampled triplets.
///
/// A triplet fixes an anchor and two distinct comparison points. The probe marks it preserved when
/// both spaces order those points alike by `(distance, row)`. Equal distances in both spaces agree
/// by row order. Equal distances in only one space agree when its row tiebreak matches the other
/// space's distance order.
///
/// An aggregate over one anchor's pairs is that anchor's own reading. Observations and merges must
/// keep the triplet total within u64.
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

        // Preserved triplets are a subset of observations. Within the u64 count capacity,
        // conversion to f64 is monotone and the denominator is positive. Therefore the rounded
        // ratio remains in [0, 1].
        UnitFraction::new_unchecked(self.preserved as f64 / self.triplets as f64)
    }
}
