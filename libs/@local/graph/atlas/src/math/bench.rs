//! Benchmark entry points for the vector and geometry kernels.
//!
//! These entry points expose primitive inputs and opaque fixtures to the `math_kernels` target
//! while keeping the math types crate-private. Fixture construction can be timed separately from
//! repeated kernel calls. [`black_box`] marks the operands and results whose computation the
//! benchmark intends to retain, without establishing a universal optimizer or production-cost
//! guarantee. Reference entry points measure the stated scalar formulations, which can differ in
//! arithmetic and output precision.

use core::hint::black_box;

use hashql_core::id::IdSlice;
use rayon::{
    iter::{IndexedParallelIterator as _, IntoParallelRefIterator as _, ParallelIterator as _},
    slice::ParallelSlice as _,
};

use super::{
    AffinityCurve, Bounds2, DVecN, FinitePointField, NonNegative, Positive, Similarity, Vec2,
    Vec2x4T, VecN, field::POINT_CHUNK, transform::Transform, vec2::Vec2x4,
};

/// Fixed-size operands for vector-kernel benchmarks.
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

/// Evaluates the vector dot product and returns its `f32` result.
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

/// Accumulates scalar `f64` products over the raw vector components.
///
/// This reference returns the `f64` sum without the kernel's final `f32` narrowing.
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

/// Evaluates the cosine distance and returns its raw reading.
///
/// Both operands must have finite components, as required by [`VecN::cosine_distance`].
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
#[must_use]
pub fn vecn_cosine_distance<const N: usize>(pair: &VecNPair<N>) -> f32 {
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

/// Curve parameters and endpoint batches for gradient benchmarks.
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
        curve: AffinityCurve::new(
            Positive::new(curve_a).expect("curve parameters should be positive and finite"),
            Positive::new(curve_b).expect("curve parameters should be positive and finite"),
        ),
        from: vec2_batch(from),
        to: vec2_batch(to),
    }
}

/// Evaluates and consumes a four-pair SIMD attraction update.
///
/// The endpoints must meet [`AffinityCurve::attraction_x4`]'s numerical conditions.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn affinity_attraction_x4(state: &AffinityState) {
    black_box(black_box(state.curve).attraction_x4(black_box(state.from), black_box(state.to)));
}

/// Evaluates and consumes scalar attraction updates for all four pairs.
///
/// The endpoints must meet [`AffinityCurve::attraction`]'s numerical conditions.
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

/// Evaluates and consumes a four-pair SIMD repulsion update.
///
/// Endpoints must meet [`AffinityCurve::repulsion_x4`]'s numerical conditions.
///
/// # Panics
///
/// Panics if `repulsion_strength` is negative or non-finite.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn affinity_repulsion_x4(state: &AffinityState, repulsion_strength: f32) {
    let repulsion_strength = NonNegative::new(repulsion_strength)
        .expect("the benchmark passes a non-negative repulsion strength");

    black_box(black_box(state.curve).repulsion_x4(
        black_box(state.from),
        black_box(state.to),
        repulsion_strength,
    ));
}

/// Evaluates and consumes a fit for the supplied spread and minimum distance.
///
/// The fit's optional result is consumed without requiring success.
///
/// # Panics
///
/// Panics when either input is not finite and strictly positive.
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

/// Affine coefficients and point batch for application benchmarks.
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

/// Evaluates and consumes affine application to a four-point SIMD batch.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn transform_apply_x4(state: &TransformBatch) {
    black_box(black_box(state.transform).apply_x4(black_box(state.batch)));
}

/// Evaluates and consumes scalar affine application to each point in the batch.
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

/// Owned point fixture for bounds and similarity benchmarks.
pub struct Points(Vec<Vec2>);

impl Points {
    /// Returns the number of fixture points.
    #[must_use]
    pub const fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns whether the point fixture is empty.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// Builds a repeating sequence of finite points on the line y = 1000 − 2x.
///
/// The sequence repeats every 40,000 points. A nonempty prefix lies on this line even when its
/// axis-aligned bounding box has area. The index modulus is below 40,000, making the conversion to
/// `u16` representable.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "the modulus is the fixture's deterministic spread rule, as the benchmark target \
              wrote it"
)]
#[expect(
    clippy::missing_panics_doc,
    reason = "the remainder modulo 40000 is below u16::MAX, making its checked conversion \
              infallible"
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

/// Evaluates and consumes SIMD bounds over the fixture slice.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn bounds_from_slice(points: &Points) {
    black_box(Bounds2::from_slice(black_box(&points.0)));
}

/// Evaluates and consumes bounds from the scalar point-iterator fold.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the reference as the target formulated it: transparently \
              inlined, with only the fold remaining"
)]
#[inline(always)]
pub fn bounds_from_points_scalar_reference(points: &Points) {
    black_box(Bounds2::from_points(black_box(&points.0).iter().copied()));
}

/// Evaluates and consumes parallel SIMD bounds over the fixture slice.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the kernel as production calls it: transparently \
              inlined, with only the kernel's call remaining"
)]
#[inline(always)]
pub fn bounds_from_slice_par(points: &Points) {
    black_box(Bounds2::from_slice_par(black_box(&points.0)));
}

/// Owned point correspondences and weights for similarity-fitting benchmarks.
pub struct SimilarityFixture {
    source: Vec<Vec2>,
    target: Vec<Vec2>,
    weights: Vec<f32>,
}

/// Maps a collinear source fixture through a reference similarity with unit weights.
///
/// `reference` uses [`Similarity::from_array`]'s [scale, cos, sin, x, y] order. Its rotation and
/// translation must meet that constructor's numerical contract. The target coordinates can still
/// overflow during application.
///
/// # Panics
///
/// Panics when [`Similarity::from_array`] rejects the reference coefficients.
#[must_use]
pub fn similarity_fixture(count: usize, reference: [f32; 5]) -> SimilarityFixture {
    let Points(source) = scattered_points(count);
    let reference =
        Similarity::from_array(reference).expect("reference coefficients must be valid");
    let target = source.iter().map(|&point| reference.apply(point)).collect();
    let weights = vec![1.0_f32; source.len()];

    SimilarityFixture {
        source,
        target,
        weights,
    }
}

impl SimilarityFixture {
    /// Returns the number of point correspondences.
    #[must_use]
    pub const fn len(&self) -> usize {
        self.source.len()
    }

    /// Returns whether the correspondence fixture is empty.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.source.is_empty()
    }
}

/// Evaluates and consumes the serial weighted similarity fit.
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

/// Evaluates and consumes the parallel weighted similarity fit.
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

/// Fixed-size logit fixture for softmax benchmarks.
pub struct Logits<const N: usize>(DVecN<N>);

/// Builds the logit vector from plain components.
#[must_use]
pub fn logits<const N: usize>(components: [f64; N]) -> Logits<N> {
    Logits(DVecN::new(components))
}

/// Evaluates and consumes the vector's max-shifted softmax.
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
    /// Row identifiers for finite-field benchmark fixtures.
    ///
    #[id(const)]
    pub struct BenchRowId(u32)
}

/// Owned finite coordinates for field-validation benchmarks.
pub struct FiniteField {
    points: Vec<Vec2>,
}

/// Builds `rows` finite points from a repeating 256-value sequence.
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

/// Tests the fixture with the field constructor's serial finiteness scan.
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

/// Tests every point for finiteness with a parallel per-point search.
///
/// Returns true exactly when every coordinate is finite.
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

/// Tests finiteness with SIMD predicates over parallel point chunks.
///
/// Chunks contain at most [`POINT_CHUNK`] points. Each uses scalar alignment prefix/suffix checks
/// and four-point batch checks. Returns true exactly when every coordinate is finite.
#[expect(
    clippy::inline_always,
    reason = "the benchmark must measure the reference formulation whole: transparently inlined, \
              with only the parallel fold remaining"
)]
#[inline(always)]
#[must_use]
pub fn finite_scan_chunked(field: &FiniteField) -> bool {
    black_box(&field.points)
        .par_chunks(POINT_CHUNK.get())
        .all(|chunk| {
            let (prefix, batches, suffix) = Vec2x4::from_slice(chunk);

            prefix.iter().all(|point| point.is_finite())
                && batches.iter().all(|batch| batch.is_finite())
                && suffix.iter().all(|point| point.is_finite())
        })
}
