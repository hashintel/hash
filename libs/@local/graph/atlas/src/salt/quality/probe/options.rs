//! Sampling settings and corpus-size checks for a quality probe.

use alloc::borrow::Cow;
use core::num::NonZero;

use super::error::ProbeError;
use crate::math::nz;

// recorded representation-baseline readings over the 985,932-row development corpus were 0.883,
// 0.890 and 0.893 at k = 15, 30 and 50 (2,196,562 edges, 49 types, 1,024 anchors, 4,096
// comparisons, seed 0). Keeping those sizes permits comparison without interpolation. That one
// landmark-baseline generation motivates the reporting scale, not fidelity thresholds. the defaults
// request (256 + 4,096) · 3,072 f32 canonical components, about 53.5 MB of payload, with k well
// inside the aggregate's k ≤ m/2 domain. The uniform anchor sample supplies no minimum count for
// any subgroup.
/// The default anchor sample size.
const DEFAULT_ANCHORS: NonZero<usize> = nz!(256);
/// The default size of the shared comparison universe.
const DEFAULT_COMPARISONS: NonZero<usize> = nz!(4096);
/// The default neighbourhood sizes, in reporting order.
const DEFAULT_NEIGHBOURHOODS: &[NonZero<usize>] = &[nz!(15), nz!(30), nz!(50)];
/// The default horizon multiplier of the intrusion and extrusion readings.
const DEFAULT_HORIZON_FACTOR: NonZero<usize> = nz!(2);
// The pair draws are independent conditional on fixed anchors and comparison rows, but all anchors
// reuse each pair. Averaging one pair's verdicts across anchors gives a value in [0, 1] with
// variance at most 1/4. Therefore averaging 64 independent pair means has conditional standard
// error at most 0.5/√64 = 0.0625, not the 0.5/√16,384 = 0.00390625 bound for 256 · 64 independent
// verdicts. This bounds the pair-sampling contribution, not the additional uncertainty from anchor
// and comparison sampling.
/// The default shared triplet-pair sample size.
const DEFAULT_TRIPLET_PAIRS: usize = 64;

/// Sampling and neighbourhood settings for one probe.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProbeOptions {
    /// Upper bound on sampled anchor rows: the queries every reading aggregates over.
    ///
    /// Uses 256 by default.
    pub anchors: NonZero<usize> = DEFAULT_ANCHORS,
    /// Upper bound on sampled comparison rows: the shared universe the sampled pass ranks.
    ///
    /// Uses 4,096 by default. More rows measure finer neighbourhood scales at the same k and grow the canonical fetch linearly.
    pub comparisons: NonZero<usize> = DEFAULT_COMPARISONS,
    /// Neighbourhood sizes to read at, in reporting order.
    ///
    /// Uses `[15, 30, 50]` by default. The list must name at least one size. Each size contracts to half the resolved comparison count for rank metrics, preserving reporting order. Density shares those sizes, except with two rows where it uses one. Recall rising with k can suggest near-boundary reshuffling, but the trend alone does not identify its cause.
    pub neighbourhoods: Cow<'static, [NonZero<usize>]> = Cow::Borrowed(DEFAULT_NEIGHBOURHOODS),
    /// Horizon multiplier for the intrusion and extrusion readings.
    ///
    /// Uses 2 by default. A false neighbour counts as an intrusion or extrusion when its one-based opposite-space rank exceeds min(factor · k, universe), distinguishing distant ranks from swaps near the neighbourhood boundary.
    pub horizon_factor: NonZero<usize> = DEFAULT_HORIZON_FACTOR,
    /// Comparison-point pairs sampled for the triplet readings.
    ///
    /// Uses 64 by default. Each pair contains distinct comparison points, but pairs sample with replacement. Every anchor evaluates the same pairs. Conditional on the selected anchors and comparison rows, their mean is unbiased for agreement over all ordered pairs. The anchor-times-pair total is not a count of independent observations.
    ///
    /// Zero disables triplet sampling. The resulting report cannot pass admission because the triplet control requires observed triplets.
    pub triplet_pairs: usize = DEFAULT_TRIPLET_PAIRS,
}

const impl Default for ProbeOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// Disjoint sample budgets and metric axes supported by one corpus.
///
/// Rank metrics require one anchor and two comparisons. Density requires one anchor and one
/// non-anchor row. Empty axes identify populations below those domains.
pub(super) struct ProbeDesign {
    pub anchors: usize,
    pub comparisons: usize,
    pub neighbourhoods: Vec<NonZero<usize>>,
    pub density_neighbourhoods: Vec<NonZero<usize>>,
}

impl ProbeOptions {
    /// Resolves sample budgets and neighbourhoods against `rows`.
    ///
    /// Counts that fit remain unchanged. Otherwise the sample uses every row, apportioning anchors
    /// in the requested ratio, rounded down, while reserving one anchor and two comparisons when
    /// possible. Each count stays within its requested bound. Rank sizes contract to half the
    /// comparison count. Density uses the same sizes whenever rank metrics have a valid domain, and
    /// contracts to the non-anchor count otherwise.
    ///
    /// # Errors
    ///
    /// Returns [`ProbeError`] for an empty neighbourhood list or a comparison budget below two.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "sample apportionment and neighbourhood bounds round down"
    )]
    pub(super) fn resolve<E>(&self, rows: usize) -> Result<ProbeDesign, ProbeError<E>> {
        if self.neighbourhoods.is_empty() {
            return Err(ProbeError::NoNeighbourhoods);
        }

        if self.comparisons.get() < 2 {
            return Err(ProbeError::Neighbourhood {
                k: self.neighbourhoods[0],
                universe: self.comparisons.get(),
            });
        }

        let requested_anchors = self.anchors.get();
        let requested_comparisons = self.comparisons.get();

        let (anchors, comparisons) =
            if requested_anchors <= rows && requested_comparisons <= rows - requested_anchors {
                (requested_anchors, requested_comparisons)
            } else if rows < 3 {
                (rows.min(1), rows.saturating_sub(1))
            } else {
                // u128 carries the sum and product of usize values on 32-bit and 64-bit targets.
                let share = (rows as u128 * requested_anchors as u128)
                    / (requested_anchors as u128 + requested_comparisons as u128);

                let anchors = usize::try_from(share)
                    .expect("should fit the row count")
                    .clamp(1, rows - 2)
                    .max(rows.saturating_sub(requested_comparisons))
                    .min(requested_anchors);

                (anchors, rows - anchors)
            };

        let maximum = comparisons / 2;
        let neighbourhoods: Vec<_> = self
            .neighbourhoods
            .iter()
            .filter_map(|size| NonZero::new(size.get().min(maximum)))
            .collect();

        let density_neighbourhoods = if neighbourhoods.is_empty() {
            self.neighbourhoods
                .iter()
                .filter_map(|size| NonZero::new(size.get().min(rows - anchors)))
                .collect()
        } else {
            neighbourhoods.clone()
        };

        Ok(ProbeDesign {
            anchors,
            comparisons,
            neighbourhoods,
            density_neighbourhoods,
        })
    }
}

#[cfg(test)]
mod tests {
    use core::convert::Infallible;
    use std::collections::HashSet;

    use hashql_core::id::{Id as _, IdSlice};
    use proptest::{prop_assert, prop_assert_eq};
    use rand::SeedableRng as _;
    use rand_xoshiro::Xoshiro256PlusPlus;

    use super::ProbeOptions;
    use crate::{identity::NodeRowId, math::nz, salt::quality::probe::probe_sample};

    #[proptest::property_test]
    fn resolved_sample_bounds(
        #[strategy = 0_usize..256] rows: usize,
        #[strategy = proptest::prop_oneof![1_usize..256, 1_usize..=usize::MAX]] anchors: usize,
        #[strategy = proptest::prop_oneof![2_usize..256, 2_usize..=usize::MAX]] comparisons: usize,
    ) {
        let options = ProbeOptions {
            anchors: anchors.try_into().expect("should be nonzero"),
            comparisons: comparisons.try_into().expect("should be nonzero"),
            ..
        };
        let design = options
            .resolve::<Infallible>(rows)
            .expect("should resolve bounded samples");
        prop_assert!(design.anchors <= anchors);
        prop_assert!(design.comparisons <= comparisons);
        prop_assert!(design.anchors + design.comparisons <= rows);
        if rows >= 3 {
            prop_assert!(design.anchors >= 1);
            prop_assert!(design.comparisons >= 2);
        }
        for size in &design.neighbourhoods {
            prop_assert!(size.get() * 2 <= design.comparisons);
            prop_assert!(size.get() * 2 <= rows - design.anchors);
        }
        let population = vec![(); rows];
        let sample = probe_sample(
            Xoshiro256PlusPlus::seed_from_u64(42),
            IdSlice::<NodeRowId, _>::from_raw(&population),
            design.anchors,
            design.comparisons,
        );
        prop_assert_eq!(sample.len(), design.anchors + design.comparisons);
        prop_assert_eq!(sample.iter().collect::<HashSet<_>>().len(), sample.len());
        prop_assert!(sample.iter().all(|row| row.as_usize() < rows));
    }

    #[test]
    fn resolved_budget_boundaries() {
        for (anchors, comparisons) in [
            (8, 16),
            (usize::MAX, usize::MAX),
            (usize::MAX, 2),
            (1, usize::MAX),
        ] {
            let options = ProbeOptions {
                anchors: anchors.try_into().expect("should be nonzero"),
                comparisons: comparisons.try_into().expect("should be nonzero"),
                ..
            };
            for rows in [0, 1, 2, 3, 23, 24, 25] {
                let design = options
                    .resolve::<Infallible>(rows)
                    .expect("should resolve budgets");
                assert!(design.anchors <= anchors);
                assert!(design.comparisons <= comparisons);
                assert_eq!(
                    design.anchors + design.comparisons,
                    rows.min(anchors.saturating_add(comparisons))
                );
            }
        }
    }

    #[test]
    fn resolved_unchanged_design() {
        let options = ProbeOptions {
            anchors: nz!(8),
            comparisons: nz!(16),
            neighbourhoods: vec![nz!(4), nz!(1), nz!(4)].into(),
            ..
        };
        for rows in [24, 25, 48] {
            let design = options
                .resolve::<Infallible>(rows)
                .expect("should retain admissible design");
            assert_eq!((design.anchors, design.comparisons), (8, 16));
            assert_eq!(design.neighbourhoods, *options.neighbourhoods);
            assert_eq!(design.density_neighbourhoods, *options.neighbourhoods);
            let population = vec![(); rows];
            let draw = |anchors, comparisons| {
                probe_sample(
                    Xoshiro256PlusPlus::seed_from_u64(7),
                    IdSlice::<NodeRowId, _>::from_raw(&population),
                    anchors,
                    comparisons,
                )
            };
            assert_eq!(draw(design.anchors, design.comparisons), draw(8, 16));
        }
    }
}
