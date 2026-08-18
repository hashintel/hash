//! Benchmark entry points for the vector and geometry kernels.
//!
//! The `math_kernels` benchmark target times each kernel exactly as production calls it. Inputs
//! are built once ahead of the timed region, because production holds its vectors and transforms
//! across the fit loop's hot calls. Each timed function is a transparently inlined forwarder whose
//! operands stay pinned behind [`black_box`] at the same per-operand points the target used when
//! it named these types itself. Results that are plain numbers return to the caller. Results in
//! crate types are pinned here and dropped, so no internal type escapes. Nothing here is API for
//! consumers of the crate.

use core::hint::black_box;

use hashql_core::id::IdSlice;
use rayon::{
    iter::{IndexedParallelIterator as _, IntoParallelRefIterator as _, ParallelIterator as _},
    slice::ParallelSlice as _,
};

use super::{
    AffinityCurve, Bounds2, DVecN, FinitePointField, Positive, Similarity, Vec2, Vec2x4T, VecN,
    field::POINT_CHUNK, transform::Transform, vec2::Vec2x4,
};

/// A dot-product operand pair, built once ahead of the timed region.
pub struct VecNPair<const N: usize> {
    left: VecN<N>,
    right: VecN<N>,
}

/// Builds the operand pair from plain component arrays.
#[must_use]
pub fn vecn_pair<const N: usize>(left: [f32; N], right: [f32; N]) -> VecNPair<N> {
    VecNPair {
        left: VecN::new(left),
        right: VecN::new(right),
    }
}

/// Dot product, as production calls it.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
#[must_use]
pub fn vecn_dot<const N: usize>(pair: &VecNPair<N>) -> f32 {
    black_box(&pair.left).dot(black_box(&pair.right))
}

/// The dot product's scalar reference accumulates lanewise `f64` products over the raw components.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the reference as the target formulated it: transparently \
              inlined, with only the scalar loop remaining"
)]
#[inline(always)]
#[must_use]
pub fn vecn_dot_scalar_reference<const N: usize>(pair: &VecNPair<N>) -> f64 {
    black_box(&pair.left)
        .as_array()
        .iter()
        .zip(black_box(&pair.right).as_array())
        .map(|(&l_value, &r_value)| f64::from(l_value) * f64::from(r_value))
        .sum::<f64>()
}

/// Cosine distance, as production calls it.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
#[must_use]
pub fn vecn_cosine_distance<const N: usize>(pair: &VecNPair<N>) -> f32 {
    // The raw reading crosses the hook because the scalar family is crate-internal and the
    // bench target is another crate.
    black_box(&pair.left)
        .cosine_distance(black_box(&pair.right))
        .get()
}

/// Builds a four-lane batch from plain `[x, y]` pairs.
fn vec2_batch(points: [[f32; 2]; 4]) -> Vec2x4T {
    Vec2x4T::from([
        Vec2::new(points[0][0], points[0][1]),
        Vec2::new(points[1][0], points[1][1]),
        Vec2::new(points[2][0], points[2][1]),
        Vec2::new(points[3][0], points[3][1]),
    ])
}

/// An affinity curve with one four-lane endpoint batch, built once ahead of the timed region.
pub struct AffinityState {
    curve: AffinityCurve,
    from: Vec2x4T,
    to: Vec2x4T,
}

/// Builds the curve and endpoint batch from plain scalars and `[x, y]` pairs.
///
/// # Panics
///
/// This panics when the curve parameters are not positive and finite.
#[must_use]
pub fn affinity_state(
    curve_a: f32,
    curve_b: f32,
    from: [[f32; 2]; 4],
    to: [[f32; 2]; 4],
) -> AffinityState {
    AffinityState {
        curve: AffinityCurve::new(curve_a, curve_b)
            .expect("curve parameters should be positive and finite"),
        from: vec2_batch(from),
        to: vec2_batch(to),
    }
}

/// Four-lane attraction, as production calls it.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn affinity_attraction_x4(state: &AffinityState) {
    black_box(black_box(state.curve).attraction_x4(black_box(state.from), black_box(state.to)));
}

/// The four-lane attraction's scalar reference runs one lane at a time through the scalar kernel.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the reference as the target formulated it: transparently \
              inlined, with only the lanewise calls remaining"
)]
#[inline(always)]
pub fn affinity_attraction_scalar_reference(state: &AffinityState) {
    black_box(core::array::from_fn::<_, 4, _>(|index| {
        black_box(state.curve).attraction(
            black_box(state.from).get(index),
            black_box(state.to).get(index),
        )
    }));
}

/// Four-lane repulsion, as production calls it.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn affinity_repulsion_x4(state: &AffinityState, repulsion_strength: f32) {
    black_box(black_box(state.curve).repulsion_x4(
        black_box(state.from),
        black_box(state.to),
        repulsion_strength,
    ));
}

/// The curve fit at one reference point, as production calls it.
///
/// # Panics
///
/// This panics when either input is not finite and strictly positive, because the benchmark
/// synthesizes its own inputs and a degenerate one is a harness defect.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn affinity_fit(spread: f32, minimum_distance: f32) {
    black_box(AffinityCurve::fit(
        black_box(Positive::new(spread).expect("the benchmark passes a positive spread")),
        black_box(
            Positive::new(minimum_distance).expect("the benchmark passes a positive distance"),
        ),
    ));
}

/// A composed transform with one four-lane point batch, built once ahead of the timed region.
pub struct TransformBatch {
    transform: Transform,
    batch: Vec2x4T,
}

/// Builds a scale-then-translate transform and its point batch from plain `[x, y]` pairs.
#[must_use]
pub fn transform_batch(
    scale: [f32; 2],
    translation: [f32; 2],
    batch: [[f32; 2]; 4],
) -> TransformBatch {
    TransformBatch {
        transform: Transform::from_scale(Vec2::new(scale[0], scale[1])).then(
            Transform::from_translation(Vec2::new(translation[0], translation[1])),
        ),
        batch: vec2_batch(batch),
    }
}

/// Four-lane transform application, as production calls it.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn transform_apply_x4(state: &TransformBatch) {
    black_box(black_box(state.transform).apply_x4(black_box(state.batch)));
}

/// The four-lane application's scalar reference runs one lane at a time through the scalar kernel.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the reference as the target formulated it: transparently \
              inlined, with only the lanewise calls remaining"
)]
#[inline(always)]
pub fn transform_apply_scalar_reference(state: &TransformBatch) {
    black_box(core::array::from_fn::<_, 4, _>(|index| {
        black_box(state.transform).apply(black_box(state.batch).get(index))
    }));
}

/// A point corpus for the bounds and similarity kernels, built once ahead of the timed region.
pub struct Points(Vec<Vec2>);

impl Points {
    /// The point count, for throughput declarations.
    #[must_use]
    pub const fn len(&self) -> usize {
        self.0.len()
    }

    /// Whether the corpus is empty.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// Deterministic 2D points spread over a non-degenerate box.
///
/// # Panics
///
/// The modulus bounds every index below `u16::MAX`, so the conversion inside never panics.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "the modulus is the fixture's deterministic spread rule, as the benchmark target \
              wrote it"
)]
#[must_use]
pub fn scattered_points(count: usize) -> Points {
    Points(
        (0..count)
            .map(|index| {
                let value = f32::from(u16::try_from(index % 40_000).expect("bounded by modulus"));

                Vec2::new((value - 17_000.0) * 0.25, (19_000.0 - value) * 0.5)
            })
            .collect(),
    )
}

/// SIMD bounds over a slice, as production calls it.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn bounds_from_slice(points: &Points) {
    black_box(Bounds2::from_slice(black_box(&points.0)));
}

/// The bounds kernel's scalar reference is the point-iterator fold.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the reference as the target formulated it: transparently \
              inlined, with only the fold remaining"
)]
#[inline(always)]
pub fn bounds_from_points_scalar_reference(points: &Points) {
    black_box(Bounds2::from_points(black_box(&points.0).iter().copied()));
}

/// Parallel SIMD bounds over a slice, as production calls it.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn bounds_from_slice_par(points: &Points) {
    black_box(Bounds2::from_slice_par(black_box(&points.0)));
}

/// A weighted source/target correspondence for the similarity fit, built once ahead of the timed
/// region.
pub struct SimilarityFixture {
    source: Vec<Vec2>,
    target: Vec<Vec2>,
    weights: Vec<f32>,
}

/// Builds the correspondence: `count` scattered source points mapped through the reference
/// similarity given as its five-element array form, with unit weights.
///
/// # Panics
///
/// This panics when the reference array's scale is not normal and positive.
#[must_use]
pub fn similarity_fixture(count: usize, reference: [f32; 5]) -> SimilarityFixture {
    let Points(source) = scattered_points(count);
    let reference = Similarity::from_array(reference).expect("scale should be normal and positive");
    let target = source.iter().map(|&point| reference.apply(point)).collect();
    let weights = vec![1.0_f32; source.len()];

    SimilarityFixture {
        source,
        target,
        weights,
    }
}

impl SimilarityFixture {
    /// The correspondence's point count, for throughput declarations.
    #[must_use]
    pub const fn len(&self) -> usize {
        self.source.len()
    }

    /// Whether the correspondence is empty.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.source.is_empty()
    }
}

/// The weighted similarity fit, as production calls it.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn similarity_fit(fixture: &SimilarityFixture) {
    black_box(Similarity::fit(
        black_box(&fixture.source),
        black_box(&fixture.target),
        black_box(&fixture.weights),
    ));
}

/// The parallel weighted similarity fit, as production calls it.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn similarity_fit_par(fixture: &SimilarityFixture) {
    black_box(Similarity::fit_par(
        black_box(&fixture.source),
        black_box(&fixture.target),
        black_box(&fixture.weights),
    ));
}

/// A logit vector for the softmax kernel, built once ahead of the timed region.
pub struct Logits<const N: usize>(DVecN<N>);

/// Builds the logit vector from plain components.
#[must_use]
pub fn logits<const N: usize>(components: [f64; N]) -> Logits<N> {
    Logits(DVecN::new(components))
}

/// Softmax, as production calls it.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn dvecn_softmax<const N: usize>(logits: &Logits<N>) {
    black_box(black_box(logits.0).softmax());
}

hashql_core::id::newtype! {
    /// The bench fields' row domain.
    #[id(const)]
    pub struct BenchRowId(u32)
}

/// A finite point field at one row count, built once ahead of the timed region.
pub struct FiniteField {
    points: Vec<Vec2>,
}

/// Builds `rows` deterministic, sign-varying finite points.
#[must_use]
pub fn finite_field(rows: usize) -> FiniteField {
    let mut counter = 0_u8;
    let points = core::iter::repeat_with(|| {
        let value = f32::from(counter);
        counter = counter.wrapping_add(1);
        let x = (value - 128.0) * 0.125;

        Vec2::new(x, 1.0 - x)
    })
    .take(rows)
    .collect();

    FiniteField { points }
}

/// The finiteness scan, as the field's constructor runs it: serial, four points per batch.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
#[must_use]
pub fn finite_scan_serial(field: &FiniteField) -> bool {
    FinitePointField::new(IdSlice::<BenchRowId, _>::from_raw(black_box(&field.points))).is_ok()
}

/// Rayon's per-point search for the first non-finite point.
///
/// True exactly when the search comes back empty, so every point is finite.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the reference transparently inlined, with only the \
              parallel search remaining"
)]
#[inline(always)]
#[must_use]
pub fn finite_scan_per_point(field: &FiniteField) -> bool {
    black_box(&field.points)
        .par_iter()
        .position_first(|point| !point.is_finite())
        .is_none()
}

/// The serial scan's batch predicate distributed over rayon chunks of [`POINT_CHUNK`] points.
///
/// True exactly when every chunk passes the batch predicate, so every point is finite.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the reference formulation whole: transparently inlined, \
              with only the parallel fold remaining"
)]
#[inline(always)]
#[must_use]
pub fn finite_scan_chunked(field: &FiniteField) -> bool {
    black_box(&field.points)
        .par_chunks(POINT_CHUNK)
        .all(|chunk| {
            let (prefix, batches, suffix) = Vec2x4::from_slice(chunk);

            prefix.iter().all(|point| point.is_finite())
                && batches.iter().all(|batch| batch.is_finite())
                && suffix.iter().all(|point| point.is_finite())
        })
}
