//! Derivations from the bound artifacts: energies, anchors, gathers, and coefficients.

use hashql_core::id::{Id, IdSlice};

use super::super::{
    super::ProjectorOptions,
    quotient::{DistinctRowId, Quotient},
};
use crate::{
    identity::NodeRowId,
    math::{DNonNegative, DPositive, FinitePointField, NonNegative, Positive, Vec2},
    salt::{
        landmark::artifact::LandmarkSkeleton,
        projector::{
            loss::{ProximalEnergy, RelationEnergy},
            scale::{LOCAL_SCALE_NEIGHBOURS, insert_nearest, sorted_median},
            train::{Coefficients, FrozenRadius, SupportAnchor},
        },
        semantic::SemanticGraphView,
    },
};

/// Composes the relation energy the ladder measures with.
///
/// From the configured lens and the boundary's frozen radius.
///
/// Returns [`None`] for a vacuous boundary: no force means no relation loss to measure.
pub(super) fn compose_energy(
    options: &ProjectorOptions,
    radius: FrozenRadius,
) -> Option<RelationEnergy> {
    let radius = match radius {
        FrozenRadius::Measured { radius } => radius,
        FrozenRadius::Vacuous => return None,
    };
    let proximal = ProximalEnergy::new(radius, options.lens.temperature());
    Some(
        RelationEnergy::new(options.lens.coincident(), proximal, options.lens.epsilon())
            .expect("the trainer composed this energy at the boundary"),
    )
}

/// Anchors every skeleton landmark at its laid-out coordinate.
///
/// With the skeleton's own local ruler as its radius.
///
/// Anchor rows are the trainer's: the skeleton publishes corpus rows, and each selected row maps to
/// its distinct index through the quotient.
///
/// The radius is the median layout distance to the landmark's nearest skeleton neighbours. That is
/// the same local-scale convention the relation loss normalizes by. A landmark in a dense skeleton
/// region therefore holds its row tighter than one in a sparse region. A one-landmark skeleton has
/// no ruler and anchors at radius zero. The support term's ε guards the division.
pub(super) fn landmark_anchors<const N: usize>(
    skeleton: &LandmarkSkeleton<NodeRowId>,
    options: &ProjectorOptions,
    quotient: &Quotient<'_, N>,
) -> Vec<SupportAnchor<DistinctRowId>> {
    let coordinates = skeleton.coordinates();

    skeleton
        .selected_rows()
        .iter_enumerated()
        .map(|(ordinal, &row)| SupportAnchor {
            row: quotient.class_of(row),
            target: coordinates[ordinal],
            radius: skeleton_scale(coordinates, ordinal),
            weight: options.landmark_support.weight(),
        })
        .collect()
}

/// Gathers a corpus frame's rows at the quotient's first rows: the training domain's own frame.
pub(super) fn gather_distinct<const N: usize>(
    frame: &FinitePointField<NodeRowId>,
    quotient: &Quotient<'_, N>,
) -> Box<FinitePointField<DistinctRowId>> {
    frame.gather(quotient.representatives())
}

/// Computes one landmark's median layout distance to its nearest skeleton neighbours.
///
/// The neighbour count and median convention are the corpus local-scale kernel's
/// ([`insert_nearest`] and [`sorted_median`]); the skeleton is capacity-bounded, so the nearest set
/// comes from a plain pass over the layout.
// PERF: this runs once per landmark and is an all-nearest-neighbours
// scan. The cost is O(S^2) distance evaluations over the
// capacity-bounded skeleton and tens of milliseconds once per fit. If
// skeleton capacity ever rises enough to matter, the fix is algorithmic
// before it is SIMD. Build one kd-tree over the layout (kiddo is
// already in-tree for serving) and take the fifteen nearest per
// landmark in O(S log S) total. The median consumes distances only, so
// tied neighbour choices cannot change the result. An exact index
// reproduces the brute-force output bit for bit. Measure at a raised
// capacity before acting.
pub(super) fn skeleton_scale<N>(coordinates: &IdSlice<N, Vec2>, ordinal: N) -> NonNegative
where
    N: Id,
{
    let mut nearest = [NonNegative::MAX; LOCAL_SCALE_NEIGHBOURS];
    let mut count = 0_usize;
    for (other, &coordinate) in coordinates.iter_enumerated() {
        if other == ordinal {
            continue;
        }

        if insert_nearest(&mut nearest, coordinates[ordinal].distance(coordinate)) {
            count += 1;
        }
    }

    let count = count.min(LOCAL_SCALE_NEIGHBOURS);
    sorted_median(&nearest[..count])
}

/// Sums the semantic graph's positive edge weight in double precision.
pub(super) fn semantic_weight<N>(view: &SemanticGraphView<'_, N>) -> DNonNegative
where
    N: Id,
{
    let mut total = DNonNegative::ZERO;

    for row in 0..view.rows() {
        for edge in view.row(N::from_usize(row)) {
            total += edge.weight;
        }
    }

    total
}

/// Normalizes the configured coefficient bases by their objective masses.
///
/// Semantic and ordinary by the total semantic edge weight, hard by the corpus row count, and each
/// support base by its own pool size. The anchor base divides by the temporal anchor pool and the
/// landmark base by the landmark pool.
///
/// The relation base passes through, and a pool of zero keeps its base inert rather than dividing
/// by nothing. A weightless graph passes every base through unchanged.
#[expect(
    clippy::cast_precision_loss,
    reason = "corpus and pool counts remain exactly representable in f64 far beyond any corpus"
)]
pub(super) fn normalized_coefficients(
    bases: Coefficients,
    weight: DNonNegative,
    rows: usize,
    anchor_pool: usize,
    landmark_pool: usize,
) -> Coefficients {
    if weight == DNonNegative::ZERO {
        return bases;
    }

    let scaled = |base: NonNegative, mass: f64| -> NonNegative {
        let Some(mass) = DPositive::new(mass) else {
            return NonNegative::ZERO;
        };

        base.widen()
            .checked_div(mass)
            .expect(
                "a normalization quotient overflows only for a mass more than 270 orders below \
                 its f32-born base, a defect of the weights",
            )
            .narrow_lossy()
    };

    Coefficients::new(
        Positive::new(scaled(bases.semantic().into(), weight.get()).get()).expect(
            "a quotient leaves the positive domain only for a weight total more than 38 orders \
             from its base",
        ),
        scaled(bases.ordinary(), weight.get()),
        scaled(bases.hard(), rows as f64),
        bases.relation(),
        scaled(bases.anchor(), anchor_pool as f64),
        scaled(bases.landmark(), landmark_pool as f64),
    )
}
