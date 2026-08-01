//! Proximal-radius calibration, the boundary measurement that freezes `u_P`.
//!
//! At the end of semantic-only training the data sets the Proximal radius. The calibration measures
//! the locally normalized distance `z` over the pairs of every reviewed-Proximal relation type and
//! freezes the radius at the 25th percentile, so the Proximal energy pulls on the outlying three
//! quarters. The low quartile anchors the boundary in the population the semantic baseline already
//! satisfies - reviewed pairs the embedding placed together - and everything beyond it feels the
//! pull, so the lens moves reviewed geometry instead of policing its fringe. "Outlying three
//! quarters" counts in the units that matter, since the force the training loop will actually apply
//! to a pair weights that pair's `z`,
//!
//! ```text
//! w = min(cap, n) / n · c · ν · p_P · h
//!     |-- sampler --|   |-- loss weight -|
//! ```
//!
//! where `min(cap, n) / n` is the pair's inclusion probability once the relation sampler draws its
//! type (the sampler draws types uniformly, so the type-level factor is constant and drops out of
//! the percentile), `c` is effective confidence, `ν` the degree normalization, and `p_P · h` the
//! group's Proximal class weight and strength multiplier. The sampler factor keeps a high-volume
//! type from buying the radius with edge count; the degree factor keeps hub-heavy types from
//! inflating it - a pair into a high-degree hub exerts proportionally little force on the layout,
//! and its pull on the percentile shrinks in the same proportion. Both factors come from the built
//! artifacts, so the measurement cannot drift from what training consumes. The `min(cap, n) / n`
//! factor is the relation objective's own per-type clip. This calibration and the training sampler
//! move in lockstep by contract, so changing the factor re-derives both surfaces together.
//!
//! The calibration measures `z = d / √((ρ_i + ε)(ρ_j + ε))` in the relation loss's own
//! normalization convention, using the same local scales and the same scale guard the relation
//! energy uses. The measured radius is what makes that energy's "act outside the radius" contract
//! mean the same population at training time.

#[cfg(test)]
mod tests;

use core::num::NonZero;

use hashql_core::id::{Id, IdSlice};

use super::{PlacementClass, ResolvedVerdict};

/// The weighted-quantile fraction at which the Proximal radius freezes.
///
/// Both the pooled radius and every leave-one-out radius freeze at this fraction, so the two
/// surfaces cannot drift apart. The per-type evidence quartiles are descriptive and keep their own
/// literals; their first entry coinciding with this fraction is today's policy choice, not a shared
/// definition.
const RADIUS_FRACTION: f64 = 0.25;
use crate::{
    identity::OntologyRowId,
    math::Vec2,
    salt::{projector::scale::LocalScales, relation::attraction::AttractionIndex},
};

/// Validated calibration parameters.
///
/// `cap` is the relation sampler's per-type edge cap and `epsilon` the relation energy's scale
/// guard; both must be the values the training loop runs with, or the measured radius describes a
/// different population than the loss acts on.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct CalibrationOptions {
    cap: NonZero<usize>,
    epsilon: f32,
}

impl CalibrationOptions {
    /// Validates calibration parameters.
    ///
    /// Returns [`None`] unless `epsilon` is finite and strictly positive, the same domain the
    /// relation energy accepts.
    #[must_use]
    pub(crate) fn new(cap: NonZero<usize>, epsilon: f32) -> Option<Self> {
        (epsilon.is_finite() && epsilon > 0.0).then_some(Self { cap, epsilon })
    }
}

/// One reviewed-Proximal type's share of the measurement.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TypeCalibration {
    /// The reviewed relation's ontology row.
    pub relation: OntologyRowId,
    /// The type's retained attraction pairs, or zero when the index holds no group for it.
    pub pairs: usize,
    /// The type's total pair weight - its mass in the pooled percentile.
    pub mass: f64,
    /// The weighted 25th, 50th, and 75th percentiles of the type's own `z` values.
    ///
    /// [`None`] when the type contributes no mass.
    pub quantiles: Option<[f32; 3]>,
    /// The pooled radius re-measured with this type left out.
    ///
    /// [`None`] when nothing else carries mass. The spread of these values across types is the
    /// review-sufficiency instrument: a tight cluster means the radius does not hinge on any
    /// single review, a wide one names the review that owns it.
    pub radius_without: Option<f32>,
}

/// The boundary measurement over every reviewed-Proximal type.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ProximalCalibration {
    /// The frozen radius `u_P`.
    ///
    /// The weighted 25th percentile of `z` over all reviewed-Proximal pairs. [`None`] when no pair
    /// carries mass - the caller decides whether that is an error (proximal mass exists elsewhere,
    /// nothing reviewed to calibrate from) or a vacuous no-op.
    pub radius: Option<f32>,
    /// Per-type evidence, in the order the verdicts resolve (ascending by relation row).
    pub types: Vec<TypeCalibration>,
}

/// Measures the reviewed-Proximal `z` population and its percentiles.
///
/// This skips verdicts with a class other than Proximal, because Overlay carries no geometry and
/// Coincident calibrates its own radius when enabled. A Proximal verdict whose relation has no
/// attraction group contributes a zero-mass evidence entry.
///
/// # Panics
///
/// This panics when the scales do not cover the coordinate rows, or when an edge references a row
/// outside them. The index, coordinates, and scales all describe one corpus, so a mismatch is a
/// wiring defect.
pub(crate) fn calibrate<N, E>(
    verdicts: &[ResolvedVerdict],
    index: &AttractionIndex<N, E>,
    coordinates: &IdSlice<N, Vec2>,
    scales: &LocalScales<N>,
    options: CalibrationOptions,
) -> ProximalCalibration
where
    N: Id,
{
    assert_eq!(
        scales.len(),
        coordinates.len(),
        "local scales and coordinates should cover the same rows"
    );

    let groups = index.groups();

    // Entries carry the owning type's ordinal in `types` so the
    // leave-one-type-out radii can exclude a type without copying.
    let mut population: Vec<(f32, f64, u32)> = Vec::new();
    let mut types: Vec<TypeCalibration> = Vec::new();

    for verdict in verdicts {
        if verdict.placement != PlacementClass::Proximal {
            continue;
        }

        let Ok(position) = groups.binary_search_by_key(&verdict.relation.as_u64(), |group| {
            group.relation().as_u64()
        }) else {
            types.push(TypeCalibration {
                relation: verdict.relation,
                pairs: 0,
                mass: 0.0,
                quantiles: None,
                radius_without: None,
            });
            continue;
        };

        let group = &groups[position];
        let edges = group.edges();
        let weights = group.weights();

        // The pair's inclusion probability once the sampler draws its type. The uniform type draw
        // itself is constant across types and drops out of the percentile.
        #[expect(
            clippy::cast_precision_loss,
            reason = "group sizes are far below f64 integer precision"
        )]
        let sampling = options.cap.get().min(edges.len()) as f64 / edges.len() as f64;
        let class = f64::from(weights.proximal) * f64::from(weights.strength);

        let tag = u32::try_from(types.len()).expect("the verdict list is far shorter than u32");
        let start = population.len();
        // Accumulated in double precision, in the group's edge order.
        let mut mass = 0.0_f64;
        for edge in edges {
            let (source, target) = (edge.source, edge.target);

            let distance = coordinates[source].distance(coordinates[target]);
            let normalization = scales.normalization(source, target, options.epsilon);
            let z = distance / normalization;

            let weight = sampling
                * f64::from(edge.confidence.value())
                * f64::from(edge.normalization)
                * class;
            mass += weight;
            population.push((z, weight, tag));
        }

        let slice = &mut population[start..];
        slice.sort_unstable_by(|left, right| left.0.total_cmp(&right.0));
        let quantiles = (mass > 0.0).then(|| {
            let entries = slice.iter().map(|&(z, weight, _)| (z, weight));

            [
                weighted_quantile(entries.clone(), mass, 0.25),
                weighted_quantile(entries.clone(), mass, 0.5),
                weighted_quantile(entries, mass, 0.75),
            ]
        });

        types.push(TypeCalibration {
            relation: verdict.relation,
            pairs: edges.len(),
            mass,
            quantiles,
            radius_without: None,
        });
    }

    let total: f64 = types.iter().map(|entry| entry.mass).sum();
    population.sort_unstable_by(|left, right| left.0.total_cmp(&right.0));
    let radius = (total > 0.0).then(|| {
        weighted_quantile(
            population.iter().map(|&(z, weight, _)| (z, weight)),
            total,
            RADIUS_FRACTION,
        )
    });

    for (index, entry) in types.iter_mut().enumerate() {
        let tag = u32::try_from(index).expect("the verdict list is far shorter than u32");
        // Summed over the surviving entries rather than subtracted from
        // the total, so the threshold cannot drift from the walked mass
        // by cancellation.
        let remaining: f64 = population
            .iter()
            .filter(|&&(_, _, owner)| owner != tag)
            .map(|&(_, weight, _)| weight)
            .sum();
        entry.radius_without = (remaining > 0.0).then(|| {
            weighted_quantile(
                population
                    .iter()
                    .filter(|&&(_, _, owner)| owner != tag)
                    .map(|&(z, weight, _)| (z, weight)),
                remaining,
                RADIUS_FRACTION,
            )
        });
    }

    ProximalCalibration { radius, types }
}

/// Returns the smallest `z` whose cumulative weight reaches the given fraction of the total.
///
/// Over entries yielded ascending by `z`.
fn weighted_quantile(
    sorted: impl IntoIterator<Item = (f32, f64)>,
    total: f64,
    fraction: f64,
) -> f32 {
    let threshold = fraction * total;
    let mut cumulative = 0.0_f64;
    let mut last = f32::NAN;
    for (z, weight) in sorted {
        cumulative += weight;
        last = z;
        if cumulative >= threshold {
            return z;
        }
    }

    // Reachable only through cumulative rounding shaving the last step
    // below the threshold; the answer is the distribution's maximum
    // either way. Callers pass a non-empty population with a positive
    // total, and every measured z is finite.
    assert!(!last.is_nan(), "a positive total implies entries");
    last
}
