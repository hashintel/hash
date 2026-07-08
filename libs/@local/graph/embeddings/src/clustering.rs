#![expect(
    unsafe_code,
    clippy::indexing_slicing,
    clippy::float_arithmetic,
    clippy::min_ident_chars,
    clippy::many_single_char_names,
    reason = "Single-char idents (k, n, m, d, x) are standard mathematical notation for \
              clustering."
)]
use alloc::borrow::Cow;
use core::{cmp, num::NonZero};
use std::collections::HashSet;

use rand::{Rng, RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;
use rayon::{
    iter::{
        IndexedParallelIterator as _, IntoParallelIterator as _, IntoParallelRefIterator as _,
        IntoParallelRefMutIterator as _, ParallelIterator as _,
    },
    slice::{ParallelSlice as _, ParallelSliceMut as _},
};

use super::{dimension::Dimension, kernel};

/// Parameters for k-means clustering.
///
/// Use [`Config::for_k_with_seed`] to construct with reasonable defaults, then override individual
/// fields as needed.
#[derive(Debug, Copy, Clone)]
pub struct Config {
    /// Number of clusters.
    pub k: u16,

    /// Maximum Lloyd iterations per run before declaring convergence.
    pub max_iters: NonZero<u16>,

    /// Number of independent restarts. The run with the lowest inertia wins.
    pub n_init: NonZero<u64>,

    /// Convergence tolerance: a run stops early when the relative change in
    /// inertia between iterations falls below this value.
    pub tol: f32,

    /// Maximum number of points sampled during k-means++ seeding.
    /// Capped to avoid quadratic seeding cost on very large datasets.
    pub sample_cap: usize,

    /// Base seed for the PRNG.
    ///
    /// Runs with the same seed, input, and configuration produce identical
    /// labels and centroids.
    pub seed: u64,

    /// Number of points processed per batch in the parallel passes.
    /// Values larger than the number of points are clamped.
    pub chunk: NonZero<usize>,
}

impl Config {
    /// Creates a configuration for `k` clusters with a fixed seed.
    ///
    /// Defaults: 30 max iterations, 5 restarts, 1e-4 convergence tolerance,
    /// sample cap of min(256k, 8192), chunk size 256.
    #[must_use]
    pub fn for_k_with_seed(k: u16, seed: u64) -> Self {
        Self {
            k,
            max_iters: const { NonZero::new(30).unwrap() },
            n_init: const { NonZero::new(5).unwrap() },
            tol: 1e-4,
            sample_cap: cmp::min(256 * usize::from(k), 8192),
            seed,
            chunk: const { NonZero::new(256).unwrap() },
        }
    }
}

/// Result of spherical k-means clustering.
///
/// `centroids` is a flat `k * d` row-major buffer where `d` is the
/// embedding [`Dimension`]. Centroid `i` occupies
/// `centroids[i * d .. (i + 1) * d]`.
pub struct Clustering {
    pub dimension: Dimension,

    /// Flat centroid matrix, `k * d` elements in row-major order.
    ///
    /// Centroids are unit-normalized, with one exception: a cluster whose
    /// members are all zero-norm points keeps a zero centroid, since there
    /// is no direction to normalize.
    pub centroids: Box<[f32]>,

    /// Cluster assignment for each input point, values in `0..k`.
    ///
    /// When [`cluster`] ran with `k == 0` (requested or clamped) the labels
    /// are all-zero placeholders and there are no centroids to index.
    pub labels: Box<[u16]>,

    /// Sum of squared chord distances from every input point to its assigned
    /// centroid, measured against the final centroids. Lower is tighter;
    /// comparable across runs on the same input, e.g. for choosing `k`.
    /// `0.0` when `k == 0` or the input is empty.
    ///
    /// The value is precise only up to floating-point summation order:
    /// repeated runs over identical input can differ in the final bits.
    pub inertia: f32,
}

impl Clustering {
    /// Allocates a zeroed clustering for `k` centroids over `n` points.
    fn new(k: u16, n: usize, d: Dimension) -> Self {
        let centroids: Box<[f32]> = vec![0.0; (k as usize) * (d.get() as usize)].into_boxed_slice();
        let labels: Box<[u16]> = vec![0; n].into_boxed_slice();

        Self {
            centroids,
            labels,
            dimension: d,
            inertia: 0.0,
        }
    }

    /// Returns the `D`-dimensional slice for centroid `cluster`.
    ///
    /// # Panics
    ///
    /// Panics if `cluster` is not below the number of centroids.
    #[must_use]
    pub fn centroid(&self, cluster: u16) -> &[f32] {
        &self.centroids[cluster as usize * (self.dimension.get() as usize)
            ..(cluster + 1) as usize * (self.dimension.get() as usize)]
    }

    /// Returns a mutable `D`-dimensional slice for centroid `cluster`.
    fn centroid_mut(&mut self, cluster: u16) -> &mut [f32] {
        &mut self.centroids[cluster as usize * (self.dimension.get() as usize)
            ..(cluster + 1) as usize * (self.dimension.get() as usize)]
    }

    /// Returns the cluster label for point `entity`.
    ///
    /// # Panics
    ///
    /// Panics if `entity` is not below the number of input points.
    #[must_use]
    pub fn label(&self, entity: usize) -> u16 {
        self.labels[entity]
    }
}

/// Draws `m` distinct indices uniformly at random from `0..n` in O(m) time
/// and memory (Robert Floyd's sampling algorithm).
///
/// The result is sorted and deterministic for a given RNG state.
fn sample_indices(n: usize, m: usize, mut rng: impl Rng) -> Vec<usize> {
    debug_assert!(m <= n);

    let mut selected: HashSet<usize> = HashSet::with_capacity(m);

    for upper in n - m..n {
        let candidate = rng.random_range(0..=upper);

        if !selected.insert(candidate) {
            // `candidate` was already drawn in an earlier round. Earlier
            // rounds only drew from `0..upper`, so `upper` itself is fresh.
            selected.insert(upper);
        }
    }

    let mut indices: Vec<usize> = selected.into_iter().collect();
    // Sorting erases the hash set's nondeterministic iteration order and
    // turns the caller's gather into a forward walk over `x`.
    indices.sort_unstable();
    indices
}

/// Squared chord distance between a point and a unit centroid.
///
/// For a unit centroid `c` and a point with inverse norm `inv`, the cosine
/// similarity is `dot(point, c) * inv`. The squared chord distance is
/// `2 - 2 * similarity`, which lies in `[0, 4]` and equals `||u - c||²`
/// when `u` is the unit-normalized point.
///
/// Returns `0.0` for zero-norm points (`point_inv_norm == 0.0`).
///
/// This is a squared distance. Do not square it again for D² sampling.
#[inline]
fn squared_chord_distance(dot: f32, point_inv_norm: f32) -> f32 {
    if point_inv_norm == 0.0 {
        return 0.0;
    }

    let similarity = (dot * point_inv_norm).clamp(-1.0, 1.0);

    2.0_f32.mul_add(-similarity, 2.0).max(0.0)
}

/// Finds the nearest centroid to `point` and returns its index and spherical
/// distance.
///
/// # Safety
///
/// * `point.len() == d`
/// * `centroids.len() == k * d`
/// * `d` is a multiple of 8 (guaranteed by [`Dimension`]).
#[inline]
#[must_use]
pub(crate) unsafe fn nearest_centroid(
    point: &[f32],
    point_inv_norm: f32,
    centroids: &[f32],
    k: NonZero<usize>,
    d: NonZero<usize>,
) -> (u16, f32) {
    debug_assert_eq!(point.len(), d.get());
    debug_assert_eq!(centroids.len(), k.get() * d.get());

    // SAFETY: the caller guarantees these preconditions. The hints let the
    // compiler elide bounds checks on the centroid slicing inside the loop.
    unsafe {
        core::hint::assert_unchecked(point.len() == d.get());
        core::hint::assert_unchecked(centroids.len() == k.get() * d.get());
        core::hint::assert_unchecked(d.get().is_multiple_of(8));
    }

    let mut best = 0;
    let mut best_dot = f32::NEG_INFINITY;

    for cluster in 0..k.get() {
        let start = cluster * d.get();
        let centroid = &centroids[start..start + d.get()];

        // SAFETY: `point` and `centroid` both have length `D`, and `D` is a
        // multiple of 8 (guaranteed by Dimension).
        let dot = unsafe { kernel::dot(point, centroid) };

        #[expect(
            clippy::cast_possible_truncation,
            reason = "cluster < k, and k originates from Config::k (u16)"
        )]
        if dot > best_dot {
            best = cluster as u16;
            best_dot = dot;
        }
    }

    (best, squared_chord_distance(best_dot, point_inv_norm))
}

/// Assigns one chunk of points during Lloyd iterations: writes each point's
/// nearest centroid into `labels` and its squared chord distance into
/// `distances`.
///
/// # Safety
///
/// * `points.len() == labels.len() * d`
/// * `inv_norms.len() == labels.len()`
/// * `distances.len() == labels.len()`
/// * `centroids.len() == k * d`
/// * `d` is a multiple of 8
unsafe fn lloyd_assign(
    k: NonZero<usize>,
    d: NonZero<usize>,
    centroids: &[f32],
    points: &[f32],
    inv_norms: &[f32],
    labels: &mut [u16],
    distances: &mut [f32],
) {
    let count = labels.len();

    // SAFETY: the caller guarantees the length relations; the hints let the
    // compiler elide bounds checks in the tiled loop below.
    unsafe {
        core::hint::assert_unchecked(points.len() == count * d.get());
        core::hint::assert_unchecked(inv_norms.len() == count);
        core::hint::assert_unchecked(distances.len() == count);
        core::hint::assert_unchecked(d.get().is_multiple_of(8));
    }

    let mut i = 0;
    while i + 4 <= count {
        let p0 = &points[i * d.get()..i * d.get() + d.get()];
        let p1 = &points[(i + 1) * d.get()..(i + 1) * d.get() + d.get()];
        let p2 = &points[(i + 2) * d.get()..(i + 2) * d.get() + d.get()];
        let p3 = &points[(i + 3) * d.get()..(i + 3) * d.get() + d.get()];

        // SAFETY: each point length d, centroids length k*d,
        // k > 0, d a multiple of 8 (guaranteed by Dimension).
        let nearest = unsafe { kernel::nearest4(p0, p1, p2, p3, centroids, k, d) };

        for offset in 0..4 {
            labels[i + offset] = nearest[offset].0;
            distances[i + offset] =
                squared_chord_distance(nearest[offset].1, inv_norms[i + offset]);
        }
        i += 4;
    }

    while i < count {
        let point = &points[i * d.get()..i * d.get() + d.get()];

        // SAFETY: point length d, centroids length k*d, k > 0, d mult of 8.
        let (label, distance) = unsafe { nearest_centroid(point, inv_norms[i], centroids, k, d) };
        labels[i] = label;
        distances[i] = distance;
        i += 1;
    }
}

/// Per-restart scratch and state for one k-means fit on the sample.
///
/// Restarts run in parallel, so each owns its buffers. [`Restart::new`]
/// hands them back zeroed.
struct Restart {
    k: NonZero<usize>,
    m: usize,
    d: NonZero<usize>,

    /// Centroids for this restart, `k * d` elements.
    centroids: Box<[f32]>,
    /// Per-cluster accumulator for centroid recomputation, `k * d` elements.
    sums: Box<[f32]>,
    /// Per-cluster point count for the empty-cluster check.
    counts: Box<[usize]>,
    /// Per-sample-point cluster assignment.
    labels: Box<[u16]>,
    /// Per-sample-point distance scratch.
    point_distances: Box<[f32]>,
    /// Tracks which sample points have been selected as seeds.
    selected: Box<[bool]>,
    /// Point indices grouped by cluster, `m` elements; grouping scratch for
    /// [`accumulate_clusters`].
    order: Box<[usize]>,
    /// Bucket cursors/boundaries, `k + 1` elements; grouping scratch for
    /// [`accumulate_clusters`].
    bounds: Box<[usize]>,
}

impl Restart {
    fn new(k: NonZero<usize>, m: usize, d: NonZero<usize>) -> Self {
        let centroids: Box<[f32]> = vec![0.0; k.get() * d.get()].into_boxed_slice();
        let sums: Box<[f32]> = vec![0.0; k.get() * d.get()].into_boxed_slice();
        let counts: Box<[usize]> = vec![0; k.get()].into_boxed_slice();
        let labels: Box<[u16]> = vec![0; m].into_boxed_slice();
        let point_distances: Box<[f32]> = vec![0.0; m].into_boxed_slice();
        let selected: Box<[bool]> = vec![false; m].into_boxed_slice();
        let order: Box<[usize]> = vec![0; m].into_boxed_slice();
        let bounds: Box<[usize]> = vec![0; k.get() + 1].into_boxed_slice();

        Self {
            k,
            m,
            d,
            centroids,
            sums,
            counts,
            labels,
            point_distances,
            selected,
            order,
            bounds,
        }
    }

    /// Runs one restart: k-means++ seeding followed by Lloyd iterations.
    ///
    /// Returns the sample inertia of the fitted centroids.
    fn run(
        &mut self,
        sample: &[f32],
        chunk: usize,
        row_chunk: usize,
        sample_inv_norms: &[f32],
        seed: u64,
        config: &Config,
    ) -> f32 {
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);

        // `new` zeroes everything else; the distance scratch must start at
        // infinity so the first seeding pass overwrites every entry.
        self.point_distances.fill(f32::INFINITY);

        self.seed_plusplus(sample, sample_inv_norms, &mut rng);
        self.lloyd(sample, chunk, row_chunk, sample_inv_norms, config)
    }

    /// k-means++ D² weighted seeding. Picks `k` initial centroids from the
    /// sample, each chosen with probability proportional to its squared
    /// distance from the nearest already-chosen centroid.
    fn seed_plusplus(&mut self, sample: &[f32], sample_inv_norms: &[f32], rng: &mut impl Rng) {
        let &mut Self { d, k, m, .. } = self;
        let mut point = rng.random_range(0..m);

        for cluster in 0..k.get() {
            let centroid_start = cluster * d.get();
            let point_start = point * d.get();

            self.centroids[centroid_start..centroid_start + d.get()]
                .copy_from_slice(&sample[point_start..point_start + d.get()]);

            // SAFETY: centroid rows have length `d`, and `d` is a multiple of 8.
            unsafe {
                kernel::normalize(&mut self.centroids[centroid_start..centroid_start + d.get()]);
            }

            self.selected[point] = true;

            // The last centroid needs no D² update: those distances would
            // only be used to sample a further seed.
            if cluster + 1 == k.get() {
                break;
            }

            let centroid = &self.centroids[centroid_start..centroid_start + d.get()];

            // Per-element writes only, so the pass is deterministic under
            // rayon; the D² total is summed sequentially below.
            sample
                .par_chunks_exact(d.get())
                .zip(sample_inv_norms.par_iter())
                .zip(self.point_distances.par_iter_mut())
                .enumerate()
                .for_each(|(index, ((point, &inv_norm), closest))| {
                    if self.selected[index] {
                        *closest = 0.0;
                        return;
                    }

                    // SAFETY: `point` and `centroid` both have length `D`, and
                    // `D` is a multiple of 8 (guaranteed by Dimension).
                    let dot = unsafe { kernel::dot(point, centroid) };
                    let distance = squared_chord_distance(dot, inv_norm);

                    if distance < *closest {
                        *closest = distance;
                    }
                });

            let total: f32 = self.point_distances.iter().sum();

            point = if total.is_finite() && total > 0.0 {
                let mut target = rng.random_range(0.0..total);
                let mut sampled = None;
                let mut last_positive = 0;

                for (index, &distance) in self.point_distances.iter().enumerate() {
                    if distance <= 0.0 {
                        continue;
                    }

                    last_positive = index;
                    target -= distance;

                    if target <= 0.0 {
                        sampled = Some(index);
                        break;
                    }
                }

                // Rounding can leave `target` marginally positive after the last bucket;
                // fall back to the last point with positive mass.
                sampled.unwrap_or(last_positive)
            } else {
                // Degenerate geometry: every remaining point coincides with a seed.
                // Pick uniformly among the unselected points.
                let remaining = self.selected.iter().filter(|selected| !**selected).count();
                let mut target = rng.random_range(0..remaining);
                let mut sampled = 0;

                for (index, selected) in self.selected.iter().copied().enumerate() {
                    if selected {
                        continue;
                    }

                    if target == 0 {
                        sampled = index;
                        break;
                    }

                    target -= 1;
                }

                sampled
            };
        }
    }

    /// Runs Lloyd iterations on the sample until convergence or `max_iters`.
    ///
    /// Returns the final inertia (sum of distances to assigned centroids).
    fn lloyd(
        &mut self,
        sample: &[f32],
        chunk: usize,
        row_chunk: usize,
        sample_inv_norms: &[f32],
        config: &Config,
    ) -> f32 {
        let &mut Self { d, k, .. } = self;
        let mut previous_inertia = f32::INFINITY;
        let mut inertia = f32::INFINITY;

        for _ in 0..config.max_iters.get() {
            // Assignment: labels and per-point distances.
            // Trivially deterministic under rayon, as writes are per element.
            sample
                .par_chunks(row_chunk)
                .zip(sample_inv_norms.par_chunks(chunk))
                .zip(self.labels.par_chunks_mut(chunk))
                .zip(self.point_distances.par_chunks_mut(chunk))
                .for_each(|(((points, inv_norms), labels), distances)| {
                    // SAFETY: `par_chunks(row_chunk)` with `row_chunk == chunk * d`
                    // pairs `labels.len()` labels, distances, and inv norms with
                    // `labels.len() * d` floats of points. `self.centroids` has
                    // length `k * d`, and `d` is a multiple of 8 (guaranteed by
                    // Dimension).
                    unsafe {
                        lloyd_assign(k, d, &self.centroids, points, inv_norms, labels, distances);
                    };
                });

            inertia = self.point_distances.iter().sum();

            let mut scratch = Scratch {
                sums: &mut self.sums,
                counts: &mut self.counts,
                order: &mut self.order,
                bounds: &mut self.bounds,
            };

            // SAFETY: `d` is a multiple of 8 (guaranteed by Dimension);
            // every other requirement is checked by `accumulate_clusters`
            // itself and panics rather than misbehaving.
            unsafe {
                accumulate_clusters(
                    sample,
                    &self.labels,
                    Some(sample_inv_norms),
                    &mut scratch,
                    d,
                );
            }

            for cluster in 0..k.get() {
                if self.counts[cluster] == 0 {
                    continue;
                }

                let start = cluster * d.get();

                // Normalization is scale-invariant, so the raw sum gives the same direction as the
                // average.
                self.centroids[start..start + d.get()]
                    .copy_from_slice(&self.sums[start..start + d.get()]);

                // SAFETY: centroid rows have length `d`, and `d` is a multiple of 8
                // (guaranteed by Dimension).
                unsafe {
                    kernel::normalize(&mut self.centroids[start..start + d.get()]);
                }
            }

            let reseeded = self.reinit_empty_clusters(sample);

            // Skip the convergence check when a cluster was just reseeded:
            // the reseeded centroid hasn't had an assignment pass yet, so
            // breaking now would waste the reinit.
            if !reseeded && previous_inertia.is_finite() {
                let relative_change =
                    (previous_inertia - inertia).abs() / previous_inertia.max(f32::EPSILON);

                if relative_change <= config.tol {
                    break;
                }
            }

            previous_inertia = inertia;
        }

        inertia
    }

    /// Reinitializes empty clusters from the sample point farthest from its
    /// assigned centroid, using the distances stored by the assignment pass.
    ///
    /// After relocating a point its stored distance is zeroed and its label
    /// updated, so subsequent empty clusters in the same pass pick different
    /// points.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "cluster index < k, and k originates from Config::k (u16)"
    )]
    fn reinit_empty_clusters(&mut self, sample: &[f32]) -> bool {
        let &mut Self { d, k, .. } = self;
        let mut reseeded = false;

        for cluster in 0..k.get() {
            if self.counts[cluster] != 0 {
                continue;
            }

            reseeded = true;

            let mut farthest_idx = 0;
            let mut farthest_dist = -1.0_f32;

            for (index, &distance) in self.point_distances.iter().enumerate() {
                if distance > farthest_dist {
                    farthest_dist = distance;
                    farthest_idx = index;
                }
            }

            let point_start = farthest_idx * d.get();
            let centroid_start = cluster * d.get();

            self.centroids[centroid_start..centroid_start + d.get()]
                .copy_from_slice(&sample[point_start..point_start + d.get()]);

            // SAFETY: centroid rows have length `d`, a multiple of 8.
            unsafe {
                kernel::normalize(&mut self.centroids[centroid_start..centroid_start + d.get()]);
            }

            self.labels[farthest_idx] = cluster as u16;
            self.point_distances[farthest_idx] = 0.0;
        }

        reseeded
    }
}

/// Borrowed scratch for [`accumulate_clusters`].
struct Scratch<'ctx> {
    /// Per-cluster accumulator, `k * d` elements.
    sums: &'ctx mut [f32],
    /// Per-cluster point count, `k` elements.
    counts: &'ctx mut [usize],
    /// Point indices grouped by cluster, one per labeled point.
    order: &'ctx mut [usize],
    /// Bucket cursors during the scatter, bucket boundaries after;
    /// `k + 1` elements.
    bounds: &'ctx mut [usize],
}

/// Recomputes per-cluster sums and counts from labeled points.
///
/// Points are grouped by cluster first (a stable counting sort on labels,
/// through `order` and `bounds`), then each cluster task walks only its own
/// bucket: one pass over the labels instead of one per cluster. Buckets
/// preserve ascending point order, so every cluster sum receives its
/// additions in a fixed order and the result is impervious to any thread
/// schedule order: the grouping runs sequentially on the calling thread,
/// and each sum is reduced by exactly one task over a fixed range.
///
/// `inv_norms` supplies precomputed inverse norms; pass `None` to compute
/// them on the fly.
///
/// Zero-norm points are counted but contribute nothing to the sums.
///
/// `order` and `bounds` are grouping scratch; their contents on entry are
/// irrelevant.
///
/// # Panics
///
/// Panics if any label is not below `counts.len()`, or if the scratch and
/// input shapes are inconsistent: `order.len() != labels.len()`,
/// `bounds.len() != counts.len() + 1`, `sums.len() != counts.len() * d`,
/// or `inv_norms` (when provided) not one entry per label.
///
/// # Safety
///
/// * `d` is a multiple of 8
unsafe fn accumulate_clusters(
    points: &[f32],
    labels: &[u16],
    inv_norms: Option<&[f32]>,
    Scratch {
        sums,
        counts,
        order,
        bounds,
    }: &mut Scratch<'_>,
    d: NonZero<usize>,
) {
    let d = d.get();

    // We deliberately opt into checked indexing here. Profiling via performance counters on
    // Apple M5 (which does have a large out-of-order execution window) showed that the fully
    // checked version has negligible cost: an additional ~13 instructions and ~6 branches per
    // point (+5.3% instructions), yet no increase in cycle count. This is because the check
    // branches are >99.8% predicted, and the extra µops retire from issue slots that otherwise
    // sit idle behind FMA and load latency (backend stall slots *drop* ~4%); the loop is
    // memory/FMA-bound, not issue-bound.
    //
    // While the measurements are specific to Apple M5, the general trend should be transferable
    // to other architectures.
    //
    // The checks buy panics-instead-of-UB for free, shrinking `# Safety` to the kernels'
    // alignment requirement. Do not switch this back to unchecked indexing without new
    // measurements.
    assert!(inv_norms.is_none_or(|norms| norms.len() == labels.len()));
    assert_eq!(order.len(), labels.len());
    assert_eq!(bounds.len(), counts.len() + 1);
    assert!(!bounds.is_empty());
    assert_eq!(sums.len(), counts.len() * d);

    // 1. Histogram: the counts double as the bucket sizes, and the checked indexing doubles as
    //    validation: an out-of-range label panics here, before any scratch is written.
    counts.fill(0);
    for &label in labels {
        counts[usize::from(label)] += 1;
    }

    // 2. Bucket starts. During the scatter, `bounds[c + 1]` is cluster `c`'s write cursor; each
    //    cursor ends at its bucket end, leaving `bounds` as exactly the boundary array the gather
    //    needs: cluster `c` owns `order[bounds[c]..bounds[c + 1]]`.
    bounds[0] = 0;
    let mut running = 0;
    for (bound, &count) in bounds[1..].iter_mut().zip(counts.iter()) {
        *bound = running;
        running += count;
    }

    // 3. Stable scatter: visiting points in ascending index order keeps each bucket ascending,
    //    which pins the per-cluster addition order (and therefore the sums) regardless of how rayon
    //    schedules the gather.
    for (index, &label) in labels.iter().enumerate() {
        // Cluster `c`'s cursor starts at its bucket start and is bumped once
        // per point labeled `c`, of which the histogram counted exactly
        // `counts[c]`, so it stays below the bucket end (at most
        // `order.len()`): for histogram-validated labels these accesses
        // cannot panic.
        let cursor = &mut bounds[usize::from(label) + 1];
        order[*cursor] = index;
        *cursor += 1;
    }

    // Shared views for the parallel gather.
    let order: &[usize] = order;
    let bounds: &[usize] = bounds;

    // 4. Accumulate: one task per cluster, walking only its own bucket.
    sums.par_chunks_exact_mut(d)
        .zip(bounds.par_array_windows::<2>())
        .for_each(|(sum, &[start, end])| {
            sum.fill(0.0);

            for &index in &order[start..end] {
                let row = index * d;
                let point = &points[row..row + d];

                let inv_norm = inv_norms.map_or_else(
                    || {
                        // SAFETY: `point` has length `d`, a multiple of 8
                        // (guaranteed by the caller).
                        let norm = unsafe { kernel::dot(point, point) }.sqrt();

                        if norm > 0.0 { norm.recip() } else { 0.0 }
                    },
                    |inv_norms| inv_norms[index],
                );

                if inv_norm == 0.0 {
                    continue;
                }

                // SAFETY: `sum` and `point` both have length `d`, and `d` is
                // a multiple of 8 (guaranteed by the caller).
                unsafe {
                    kernel::add_scaled_into(sum, point, inv_norm);
                }
            }
        });
}

/// Labels one parallel chunk: each point gets its nearest centroid.
///
/// # Safety
///
/// * `points.len() == labels.len() * d`
/// * `centroids.len() >= k * d`
/// * `d` is a multiple of 8
unsafe fn label_chunk(
    centroids: &[f32],
    k_nz: NonZero<usize>,
    d_nz: NonZero<usize>,
    points: &[f32],
    labels: &mut [u16],
) {
    let k = k_nz.get();
    let d = d_nz.get();

    let count = labels.len();

    // SAFETY: each parallel chunk pairs `count` labels with `count * d`
    // floats of point data; `d` is a multiple of 8 (guaranteed by Dimension).
    unsafe {
        core::hint::assert_unchecked(points.len() == count * d);
        core::hint::assert_unchecked(centroids.len() >= k * d);
        core::hint::assert_unchecked(d.is_multiple_of(8));
    }

    let mut i = 0;
    while i + 4 <= count {
        let p0 = &points[i * d..i * d + d];
        let p1 = &points[(i + 1) * d..(i + 1) * d + d];
        let p2 = &points[(i + 2) * d..(i + 2) * d + d];
        let p3 = &points[(i + 3) * d..(i + 3) * d + d];

        // SAFETY: each point length d, centroids length k*d, k > 0,
        // d a multiple of 8 (guaranteed by Dimension).
        let nearest = unsafe { kernel::nearest4(p0, p1, p2, p3, centroids, k_nz, d_nz) };

        labels[i] = nearest[0].0;
        labels[i + 1] = nearest[1].0;
        labels[i + 2] = nearest[2].0;
        labels[i + 3] = nearest[3].0;
        i += 4;
    }

    while i < count {
        let point = &points[i * d..i * d + d];
        // SAFETY: point length d, centroids length k*d, k > 0, d mult of 8.
        let (label, _) = unsafe { nearest_centroid(point, 1.0, centroids, k_nz, d_nz) };
        labels[i] = label;
        i += 1;
    }
}

/// Labels one parallel chunk against the final centroids and returns its
/// inertia contribution. Inverse norms are computed on the fly.
///
/// # Safety
///
/// * `points.len() == labels.len() * d`
/// * `centroids.len() >= k * d`
/// * `d` is a multiple of 8
unsafe fn score_chunk(
    centroids: &[f32],
    k: NonZero<usize>,
    d_nz: NonZero<usize>,
    points: &[f32],
    labels: &mut [u16],
) -> f32 {
    let d = d_nz.get();

    debug_assert_eq!(points.len(), labels.len() * d);

    // SAFETY: The caller must ensure `points.len() == labels.len() * d`.
    unsafe {
        core::hint::assert_unchecked(points.len() == labels.len() * d);
    }

    let count = labels.len();
    let mut inertia = 0.0_f32;

    let mut i = 0;
    while i + 4 <= count {
        let p0 = &points[i * d..i * d + d];
        let p1 = &points[(i + 1) * d..(i + 1) * d + d];
        let p2 = &points[(i + 2) * d..(i + 2) * d + d];
        let p3 = &points[(i + 3) * d..(i + 3) * d + d];

        // SAFETY: each point length d, centroids length k*d, k > 0,
        // d a multiple of 8 (guaranteed by Dimension).
        let nearest = unsafe { kernel::nearest4(p0, p1, p2, p3, centroids, k, d_nz) };
        let ps = [p0, p1, p2, p3];

        for offset in 0..4 {
            labels[i + offset] = nearest[offset].0;

            // SAFETY: point length d, a multiple of 8.
            let norm = unsafe { kernel::dot(ps[offset], ps[offset]) }.sqrt();
            let inv_norm = if norm > 0.0 { norm.recip() } else { 0.0 };
            inertia += squared_chord_distance(nearest[offset].1, inv_norm);
        }
        i += 4;
    }

    while i < count {
        let point = &points[i * d..i * d + d];

        // SAFETY: point length d, a multiple of 8.
        let norm = unsafe { kernel::dot(point, point) }.sqrt();
        let inv_norm = if norm > 0.0 { norm.recip() } else { 0.0 };

        // SAFETY: point length d, centroids length k*d, k > 0, d mult of 8.
        let (label, distance) = unsafe { nearest_centroid(point, inv_norm, centroids, k, d_nz) };
        labels[i] = label;
        inertia += distance;
        i += 1;
    }

    inertia
}

/// Labels every point with its nearest centroid.
///
/// # Safety
///
/// * `x.len() == n * d` for some `n`
/// * `clustering.centroids.len() == k * d`
/// * `clustering.labels.len() == n`
/// * `d` is a multiple of 8
unsafe fn reassign(
    x: &[f32],
    centroids: &[f32],
    labels: &mut [u16],
    k: NonZero<usize>,
    d: NonZero<usize>,
    chunk: usize,
    row_chunk: usize,
) {
    x.par_chunks(row_chunk)
        .zip(labels.par_chunks_mut(chunk))
        .for_each(|(points, labels)| {
            // SAFETY: `par_chunks(row_chunk)` with `row_chunk = chunk * d`
            // ensures `points.len() == labels.len() * d`. Centroids and k
            // are valid from the caller.
            unsafe {
                label_chunk(centroids, k, d, points, labels);
            }
        });
}

/// Labels every point with its nearest centroid and returns the total
/// inertia.
///
/// Labels are exact; the inertia is precise only up to floating-point
/// summation order.
///
/// # Safety
///
/// * `x.len() == n * d` for some `n`
/// * `clustering.centroids.len() == k * d`
/// * `clustering.labels.len() == n`
/// * `d` is a multiple of 8
unsafe fn reassign_scored(
    x: &[f32],
    centroids: &[f32],
    labels: &mut [u16],
    k: NonZero<usize>,
    d: NonZero<usize>,
    chunk: usize,
    row_chunk: usize,
) -> f32 {
    // Unordered parallel reduction: the grouping follows rayon's scheduling, so the sum is not
    // bit-stable. An ordered reduction would need to collect per-chunk partials, costing an
    // allocation per call.
    x.par_chunks(row_chunk)
        .zip(labels.par_chunks_mut(chunk))
        .map(|(points, labels)| {
            // SAFETY: `par_chunks(row_chunk)` with `row_chunk = chunk * d`
            // ensures `points.len() == labels.len() * d`. Centroids and k
            // are valid from the caller.
            unsafe { score_chunk(centroids, k, d, points, labels) }
        })
        .sum()
}

/// Assigns all `n` points to their nearest centroid, recomputes centroids
/// from the full population, and re-labels against the final centroids.
/// Returns the full-data inertia.
///
/// `scratch` contents on entry are irrelevant; its shape is validated by
/// [`accumulate_clusters`], which panics on any mismatch.
///
/// # Safety
///
/// * `x.len() == n * d` for some `n`
/// * `clustering.centroids.len() == k * d`
/// * `clustering.labels.len() == n`
/// * `d` is a multiple of 8
unsafe fn assign(
    x: &[f32],
    clustering: &mut Clustering,
    k: NonZero<usize>,
    chunk: usize,
    row_chunk: usize,
    scratch: &mut Scratch<'_>,
) -> f32 {
    let d = NonZero::<usize>::from(clustering.dimension.value());

    // 1. Label all points against the sample-fitted centroids.
    // SAFETY: forwarded from the caller.
    unsafe {
        reassign(
            x,
            &clustering.centroids,
            &mut clustering.labels,
            k,
            d,
            chunk,
            row_chunk,
        );
    }

    // 2. Recompute centroids from the full population.
    // SAFETY: `d` is a multiple of 8 (guaranteed by Dimension); every other
    // requirement is checked by `accumulate_clusters` itself and panics
    // rather than misbehaving.
    unsafe {
        accumulate_clusters(x, &clustering.labels, None, scratch, d);
    }

    for (cluster, count) in scratch.counts.iter_mut().enumerate() {
        if *count == 0 {
            continue;
        }

        let start = cluster * d.get();

        #[expect(
            clippy::cast_possible_truncation,
            reason = "cluster < k and k originates from Config::k (u16)"
        )]
        let centroid = clustering.centroid_mut(cluster as u16);
        // Normalization is scale-invariant, so the raw sum gives the same
        // direction as the average.
        centroid.copy_from_slice(&scratch.sums[start..start + d.get()]);

        // SAFETY: centroid length d, a multiple of 8.
        unsafe {
            kernel::normalize(centroid);
        }
    }

    // 3. Final labels and inertia against the recomputed centroids.
    // SAFETY: centroids were just recomputed in place; same invariants hold.
    unsafe {
        reassign_scored(
            x,
            &clustering.centroids,
            &mut clustering.labels,
            k,
            d,
            chunk,
            row_chunk,
        )
    }
}

/// Runs spherical k-means over a flat row-major embedding matrix.
///
/// `x` contains `n` points of `dimension` floats each, laid out
/// contiguously. Returns cluster assignments, unit-normalized centroids, and
/// the full-data inertia.
///
/// Given the same input and configuration, the returned labels and
/// centroids are identical across runs; the inertia is precise only up to
/// floating-point summation order (see [`Clustering::inertia`]).
///
/// Zero-norm points do not influence centroids, and are always assigned to
/// cluster 0 at distance 0. If a cluster consists solely of zero-norm points,
/// its centroid is zero; see [`Clustering::centroids`].
///
/// If `config.k == 0` or `x` is empty there is nothing to fit: the result
/// has no centroids, all-zero placeholder labels, and an inertia of `0.0`.
///
/// # Panics
///
/// Panics if `x.len()` is not a multiple of `dimension`.
#[must_use]
#[expect(clippy::integer_division_remainder_used, clippy::integer_division)]
pub fn cluster(x: &[f32], dimension: Dimension, config: &Config) -> Clustering {
    let d = dimension.get() as usize;
    assert!(x.len().is_multiple_of(d));

    let n = x.len() / d;
    let k = cmp::min(config.k, n.saturating_truncate());

    let mut clustering = Clustering::new(k, n, dimension);

    let Some(k) = NonZero::new(k) else {
        return clustering;
    };

    let k = NonZero::from(k);
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(config.seed);

    // 1. subsample (fit on all of n only when n is already small)
    let m = config.sample_cap.max(k.get()).min(n);

    let sample = if m == n {
        Cow::Borrowed(x)
    } else {
        let indices = sample_indices(n, m, &mut rng);
        let mut sampled = vec![0.0_f32; m * d];

        let chunks = sampled.chunks_mut(d);
        assert_eq!(chunks.len(), indices.len());

        for (chunk, index) in chunks.zip(indices) {
            chunk.copy_from_slice(&x[index * d..(index + 1) * d]);
        }

        Cow::Owned(sampled)
    };

    let sample = sample.as_ref();

    // Clamping to `n` keeps `row_chunk` from overflowing: `chunk * d` is at most `n * d ==
    // x.len()`.
    let chunk = cmp::min(config.chunk.get(), n);
    let row_chunk = chunk * d;

    let sample_inv_norms: Vec<f32> = sample
        .par_chunks_exact(d)
        .map(|point| {
            // SAFETY: every point is a `d`-sized row, and `d` is a multiple of 8 (guaranteed by
            // Dimension).
            let norm = unsafe { kernel::dot(point, point) }.sqrt();

            if norm > 0.0 { norm.recip() } else { 0.0 }
        })
        .collect();

    // 2. fit on the sample: independent k-means++ restarts in parallel, the
    // run with the lowest inertia wins (guards against bad initializations).
    // Seeds are pre-derived so the stream matches a sequential run; ties
    // break on the restart index, which keeps the winner deterministic no
    // matter how rayon schedules the restarts.
    let seeds: Vec<u64> = core::iter::repeat_with(|| rng.random())
        .take(usize::try_from(config.n_init.get()).unwrap_or(usize::MAX))
        .collect();

    let best = seeds
        .into_par_iter()
        .enumerate()
        .map(|(index, seed)| {
            let mut restart = Restart::new(k, m, dimension.value().into());
            let inertia = restart.run(sample, chunk, row_chunk, &sample_inv_norms, seed, config);

            (inertia, index, restart)
        })
        .min_by(|lhs, rhs| lhs.0.total_cmp(&rhs.0).then(lhs.1.cmp(&rhs.1)))
        .expect("config.n_init is non-zero, so at least one restart ran");

    // Reuse the winning restart's buffers: its centroids become the result
    // and its per-cluster accumulators serve the full-data recomputation,
    // instead of allocating fresh ones. Only `order` needs a fresh, `n`-sized
    // allocation (the restart's is sample-sized); this is the sole per-fit
    // scratch allocation outside setup, and none happen per iteration.
    let Restart {
        centroids,
        mut sums,
        mut counts,
        mut bounds,
        ..
    } = best.2;

    clustering.centroids = centroids;

    let mut order = vec![0_usize; n];

    let mut scratch = Scratch {
        sums: &mut sums,
        counts: &mut counts,
        order: &mut order,
        bounds: &mut bounds,
    };

    // 3. assign points to clusters
    // SAFETY: `x.len() == n * d` (asserted above), `clustering.centroids.len() == k * d`,
    // `sums` and `counts` are the restart's `k * d` and `k` sized accumulators,
    // `order` was just allocated with `n` entries, `bounds` is the restart's
    // `k + 1` boundary scratch, and `d` is a multiple of 8 (guaranteed by
    // Dimension).
    clustering.inertia = unsafe { assign(x, &mut clustering, k, chunk, row_chunk, &mut scratch) };

    clustering
}

#[cfg(test)]
mod tests {
    #![expect(
        clippy::float_cmp,
        clippy::integer_division_remainder_used,
        reason = "test module: float comparisons are intentional for exact-zero and distance \
                  checks; modulo is used in test data construction"
    )]
    use super::*;

    macro_rules! nz {
        ($expr:expr) => {
            const { NonZero::new($expr).unwrap() }
        };
    }

    /// Builds well-separated blob clusters in D-dimensional space.
    ///
    /// Each blob has a dominant axis so clusters are far apart in cosine
    /// space. Returns `(flat_points, ground_truth_labels)`.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "k is small in tests, fits in u16"
    )]
    fn make_blobs<const D: usize>(
        points_per_cluster: usize,
        k: usize,
        seed: u64,
    ) -> (Vec<f32>, Vec<u16>) {
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);
        let n = points_per_cluster * k;
        let mut data = vec![0.0_f32; n * D];
        let mut truth = vec![0_u16; n];

        for c in 0..k {
            let axis = c % D;
            for p in 0..points_per_cluster {
                let idx = c * points_per_cluster + p;
                let row = &mut data[idx * D..(idx + 1) * D];

                row[axis] = 10.0;
                for val in row.iter_mut() {
                    *val += rng.random_range(-0.01..0.01);
                }

                truth[idx] = c as u16;
            }
        }

        (data, truth)
    }

    const D: usize = 64;

    fn l2(v: &[f32]) -> f32 {
        v.iter().map(|x| x * x).sum::<f32>().sqrt()
    }

    /// Random unit-norm centroids in `D`-dimensional space.
    fn unit_random(k: NonZero<usize>, seed: u64) -> Vec<f32> {
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);
        let mut c = vec![0.0_f32; k.get() * D];
        for row in c.chunks_exact_mut(D) {
            for v in row.iter_mut() {
                *v = rng.random_range(-1.0..1.0);
            }
            let n = l2(row);
            for v in row.iter_mut() {
                *v /= n;
            }
        }
        c
    }

    /// Brute-force nearest centroid by cosine similarity.
    #[expect(clippy::cast_possible_truncation, reason = "k is small in tests")]
    fn brute_nearest_cosine(point: &[f32], centroids: &[f32], k: NonZero<usize>) -> u16 {
        let pn = l2(point);
        let mut best = 0_u16;
        let mut best_cos = f32::NEG_INFINITY;

        for c in 0..k.get() {
            let cent = &centroids[c * D..(c + 1) * D];
            let d: f32 = point.iter().zip(cent).map(|(a, b)| a * b).sum();
            let cn = l2(cent);
            let cos = if pn == 0.0 || cn == 0.0 {
                0.0
            } else {
                d / (pn * cn)
            };

            if cos > best_cos {
                best_cos = cos;
                best = c as u16;
            }
        }
        best
    }

    /// Computes clustering accuracy using majority-vote label mapping.
    ///
    /// K-means labels are permutation-invariant, so this assigns each
    /// predicted cluster to whichever ground-truth cluster it overlaps
    /// most, then counts correctly assigned points.
    #[expect(
        clippy::cast_precision_loss,
        reason = "counts are small test values, well within f64 precision"
    )]
    fn accuracy(predicted: &[u16], truth: &[u16], k: usize) -> f64 {
        let mut votes = vec![vec![0_usize; k]; k];
        for (&pred, &true_label) in predicted.iter().zip(truth) {
            votes[pred as usize][true_label as usize] += 1;
        }

        let correct: usize = votes
            .iter()
            .map(|row| row.iter().copied().max().unwrap_or(0))
            .sum();

        correct as f64 / predicted.len() as f64
    }

    /// Shorthand for [`Dimension::new`] that panics on invalid input.
    fn dim(d: u16) -> Dimension {
        Dimension::new(d).expect("test dimension must be a positive multiple of 8")
    }

    #[test]
    fn chord_identical_vectors_is_zero() {
        // dot=1.0, inv_norm=1.0 => similarity=1 => distance=0
        assert_eq!(squared_chord_distance(1.0, 1.0), 0.0);
    }

    #[test]
    fn chord_orthogonal_vectors() {
        // dot=0 => similarity=0 => distance=2
        let dist = squared_chord_distance(0.0, 1.0);
        assert!((dist - 2.0).abs() < 1e-6, "expected 2.0, got {dist}");
    }

    #[test]
    fn chord_opposite_vectors() {
        // dot=-1.0 => similarity=-1 => distance=4
        let dist = squared_chord_distance(-1.0, 1.0);
        assert!((dist - 4.0).abs() < 1e-6, "expected 4.0, got {dist}");
    }

    #[test]
    fn chord_zero_norm_returns_zero() {
        assert_eq!(squared_chord_distance(0.5, 0.0), 0.0);
        assert_eq!(squared_chord_distance(-0.5, 0.0), 0.0);
    }

    #[test]
    fn chord_is_non_negative() {
        for dot_val in [0.0, 0.5, 1.0, -0.5, -1.0, 2.0, -2.0] {
            for inv in [0.0, 0.5, 1.0, 2.0] {
                let dist = squared_chord_distance(dot_val, inv);
                assert!(dist >= 0.0, "negative for dot={dot_val}, inv={inv}: {dist}");
            }
        }
    }

    #[test]
    fn sample_indices_unique_sorted_in_range() {
        let rng = Xoshiro256PlusPlus::seed_from_u64(1);
        let indices = sample_indices(1000, 100, rng);

        assert_eq!(indices.len(), 100);
        assert!(
            indices.is_sorted_by(|lhs, rhs| lhs < rhs),
            "indices must be strictly increasing (sorted, unique)"
        );
        assert!(indices.iter().all(|&index| index < 1000));
    }

    #[test]
    fn cluster_empty_input() {
        let config = Config::for_k_with_seed(4, 42);
        let result = cluster(&[], dim(8), &config);
        assert_eq!(result.labels.len(), 0);
        assert_eq!(result.centroids.len(), 0);
        assert_eq!(result.inertia, 0.0);
    }

    #[test]
    fn cluster_k0() {
        let data = vec![1.0_f32; 8];
        let config = Config::for_k_with_seed(0, 42);
        let result = cluster(&data, dim(8), &config);
        assert_eq!(result.labels.len(), 1);
        assert_eq!(result.labels[0], 0);
        assert_eq!(result.centroids.len(), 0);
        assert_eq!(result.inertia, 0.0);
    }

    #[test]
    fn cluster_k1_all_same_label() {
        let (data, _) = make_blobs::<8>(20, 3, 123);
        let config = Config::for_k_with_seed(1, 42);
        let result = cluster(&data, dim(8), &config);

        assert_eq!(result.labels.len(), 60);
        assert!(
            result.labels.iter().all(|&l| l == 0),
            "k=1: all labels must be 0"
        );
    }

    #[test]
    fn cluster_single_point() {
        let data = vec![1.0_f32; 16];
        let config = Config::for_k_with_seed(5, 42);
        // k clamped to min(k, n) = 1
        let result = cluster(&data, dim(16), &config);
        assert_eq!(result.labels.len(), 1);
        assert_eq!(result.labels[0], 0);
    }

    #[test]
    fn cluster_n_less_than_4() {
        // n=3 exercises the scalar tail (no nearest4 tiling).
        let (data, _) = make_blobs::<8>(1, 3, 99);
        let config = Config::for_k_with_seed(3, 42);
        let result = cluster(&data, dim(8), &config);

        assert_eq!(result.labels.len(), 3);
        let mut seen = [false; 3];
        for &label in &*result.labels {
            seen[label as usize] = true;
        }
        assert!(
            seen.iter().all(|&s| s),
            "each point should have a unique cluster"
        );
    }

    #[test]
    fn cluster_n_equals_k() {
        let (data, _) = make_blobs::<8>(1, 5, 77);
        let config = Config::for_k_with_seed(5, 42);
        let result = cluster(&data, dim(8), &config);

        assert_eq!(result.labels.len(), 5);
        let mut seen = [false; 5];
        for &label in &*result.labels {
            seen[label as usize] = true;
        }
        assert!(
            seen.iter().all(|&s| s),
            "n=k: each point should be its own cluster"
        );
    }

    #[test]
    fn cluster_recovers_well_separated_blobs() {
        let (data, truth) = make_blobs::<8>(50, 4, 314);
        let config = Config::for_k_with_seed(4, 42);
        let result = cluster(&data, dim(8), &config);

        let acc = accuracy(&result.labels, &truth, 4);
        assert!(
            acc > 0.95,
            "expected >95% accuracy on well-separated blobs, got {:.1}%",
            acc * 100.0
        );
    }

    #[test]
    fn cluster_deterministic_with_same_seed() {
        let (data, _) = make_blobs::<8>(30, 3, 555);

        let r1 = cluster(&data, dim(8), &Config::for_k_with_seed(3, 42));
        let r2 = cluster(&data, dim(8), &Config::for_k_with_seed(3, 42));

        assert_eq!(r1.labels, r2.labels);
        assert_eq!(r1.centroids, r2.centroids);

        // The inertia reduction is a parallel sum, so it is only
        // deterministic up to float summation order.
        let tolerance = r1.inertia.abs().max(f32::EPSILON) * 1e-5;
        assert!(
            (r1.inertia - r2.inertia).abs() <= tolerance,
            "inertia should agree within summation-order tolerance: {} vs {}",
            r1.inertia,
            r2.inertia
        );
    }

    #[test]
    fn cluster_recovers_blobs_across_seeds() {
        let (data, truth) = make_blobs::<8>(30, 3, 555);

        for seed in [42, 9999] {
            let result = cluster(&data, dim(8), &Config::for_k_with_seed(3, seed));
            let acc = accuracy(&result.labels, &truth, 3);
            assert!(
                acc > 0.95,
                "seed {seed}: expected >95% accuracy, got {:.1}%",
                acc * 100.0
            );
        }
    }

    #[test]
    fn cluster_centroids_are_unit_normalized() {
        let (data, _) = make_blobs::<8>(40, 4, 222);
        let config = Config::for_k_with_seed(4, 42);
        let result = cluster(&data, dim(8), &config);

        for c in 0..4_u16 {
            let centroid = result.centroid(c);
            // SAFETY: centroid has length 8 (= D), a multiple of 8.
            let norm = unsafe { kernel::dot(centroid, centroid).sqrt() };
            assert!(
                (norm - 1.0).abs() < 1e-5,
                "centroid {c} has norm {norm}, expected 1.0"
            );
        }
    }

    #[test]
    fn cluster_labels_in_range() {
        let (data, _) = make_blobs::<8>(25, 5, 333);
        let config = Config::for_k_with_seed(5, 42);
        let result = cluster(&data, dim(8), &config);

        for (i, &label) in result.labels.iter().enumerate() {
            assert!(label < 5, "label[{i}] = {label}, expected < 5");
        }
    }

    #[test]
    fn cluster_labels_nearest_to_assigned_centroid() {
        let (data, _) = make_blobs::<8>(30, 3, 444);
        let config = Config::for_k_with_seed(3, 42);
        let result = cluster(&data, dim(8), &config);

        let k = 3_usize;
        let d = 8_usize;
        for (i, point) in data.chunks_exact(d).enumerate() {
            let assigned = result.labels[i];
            // SAFETY: point and centroid both have length 8 (= D), a multiple of 8.
            let assigned_dot = unsafe { kernel::dot(point, result.centroid(assigned)) };

            #[expect(clippy::cast_possible_truncation, reason = "k=3 fits in u16")]
            for c in 0..k as u16 {
                // SAFETY: point and centroid both have length 8, a multiple of 8.
                let other_dot = unsafe { kernel::dot(point, result.centroid(c)) };
                assert!(
                    other_dot <= assigned_dot + 1e-5,
                    "point {i}: assigned to {assigned} (dot={assigned_dot}) but centroid {c} has \
                     higher dot={other_dot}"
                );
            }
        }
    }

    #[test]
    fn cluster_d32_recovers_blobs() {
        let (data, truth) = make_blobs::<32>(40, 3, 888);
        let config = Config::for_k_with_seed(3, 42);
        let result = cluster(&data, dim(32), &config);

        let acc = accuracy(&result.labels, &truth, 3);
        assert!(
            acc > 0.95,
            "D=32: expected >95% accuracy, got {:.1}%",
            acc * 100.0
        );
    }

    #[test]
    fn cluster_d256_recovers_blobs() {
        // Production default dimension (matryoshka truncation target).
        let (data, truth) = make_blobs::<256>(50, 4, 1234);
        let config = Config::for_k_with_seed(4, 42);
        let result = cluster(&data, dim(256), &config);

        let acc = accuracy(&result.labels, &truth, 4);
        assert!(
            acc > 0.95,
            "D=256: expected >95% accuracy, got {:.1}%",
            acc * 100.0
        );
    }

    #[test]
    fn cluster_d1536_recovers_blobs() {
        let (data, truth) = make_blobs::<1536>(20, 3, 4321);
        let config = Config::for_k_with_seed(3, 42);
        let result = cluster(&data, dim(1536), &config);

        let acc = accuracy(&result.labels, &truth, 3);
        assert!(
            acc > 0.95,
            "D=1536: expected >95% accuracy, got {:.1}%",
            acc * 100.0
        );
    }

    #[test]
    fn cluster_chunk_sizes_produce_valid_results() {
        let (data, truth) = make_blobs::<8>(50, 4, 314);

        for chunk in [1_usize, 3, 1_000_000] {
            let mut config = Config::for_k_with_seed(4, 42);
            config.chunk = NonZero::new(chunk).expect("chunk is non-zero");
            let result = cluster(&data, dim(8), &config);

            let acc = accuracy(&result.labels, &truth, 4);
            assert!(
                acc > 0.95,
                "chunk={chunk}: expected >95% accuracy, got {:.1}%",
                acc * 100.0
            );
        }
    }

    #[test]
    fn cluster_inertia_reflects_fit_quality() {
        let (data, _) = make_blobs::<8>(50, 4, 99);

        let tight = cluster(&data, dim(8), &Config::for_k_with_seed(4, 42));
        assert!(tight.inertia.is_finite());
        assert!(tight.inertia >= 0.0);

        // Forcing 4 well-separated blobs into a single cluster must fit
        // strictly worse.
        let loose = cluster(&data, dim(8), &Config::for_k_with_seed(1, 42));
        assert!(
            loose.inertia > tight.inertia,
            "k=1 inertia {} should exceed k=4 inertia {}",
            loose.inertia,
            tight.inertia
        );
    }

    #[test]
    fn cluster_recovers_with_subsampling() {
        // n=12000 with sample_cap=1024 exercises the Cow::Owned path.
        let (data, truth) = make_blobs::<8>(2000, 6, 21);
        let mut config = Config::for_k_with_seed(6, 5);
        config.sample_cap = 1024;
        let result = cluster(&data, dim(8), &config);

        let acc = accuracy(&result.labels, &truth, 6);
        assert!(
            acc > 0.95,
            "subsampled: expected >95% accuracy, got {:.1}%",
            acc * 100.0
        );
    }

    #[test]
    fn cluster_more_clusters_than_natural_groups() {
        // 3 natural groups but k=8: empty clusters keep their seed centroid,
        // nothing should be NaN or infinite.
        let (data, _) = make_blobs::<8>(400, 3, 31);
        let result = cluster(&data, dim(8), &Config::for_k_with_seed(8, 1));

        assert!(
            result.centroids.iter().all(|v| v.is_finite()),
            "NaN or infinite centroid"
        );
        assert!(result.labels.iter().all(|&l| l < 8));
    }

    #[test]
    fn cluster_all_identical_points() {
        // Every point identical: D² distances are all zero during seeding,
        // which triggers the uniform fallback path.
        let n = 100;
        let mut data = vec![0.0_f32; n * 8];
        for row in data.chunks_exact_mut(8) {
            row[0] = 1.0;
        }
        let result = cluster(&data, dim(8), &Config::for_k_with_seed(4, 1));

        assert!(result.centroids.iter().all(|v| v.is_finite()));
        assert!(result.labels.iter().all(|&l| l < 4));
    }

    #[test]
    fn nearest_centroid_matches_brute_force_cosine() {
        let k = nz!(7);
        let centroids = unit_random(k, 99);
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(100);

        for _ in 0..1000 {
            let p: Vec<f32> = core::iter::repeat_with(|| rng.random_range(-3.0..3.0))
                .take(D)
                .collect();
            let pn = l2(&p);
            let inv = if pn > 0.0 { pn.recip() } else { 0.0 };

            // SAFETY: point has length D=64, centroids has length k*D,
            // k > 0, D is a multiple of 8.
            let (got, _) = unsafe { nearest_centroid(&p, inv, &centroids, k, nz!(D)) };
            assert_eq!(
                got,
                brute_nearest_cosine(&p, &centroids, k),
                "mismatch for point norm={pn}"
            );
        }
    }

    #[test]
    fn nearest_centroid_argmax_independent_of_inv_norm() {
        let k = nz!(5);
        let centroids = unit_random(k, 7);
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(8);

        for _ in 0..500 {
            let p: Vec<f32> = core::iter::repeat_with(|| rng.random_range(-2.0..2.0))
                .take(D)
                .collect();

            // SAFETY: point has length D=64, centroids has length k*D,
            // k > 0, D is a multiple of 8.
            let (a, _) = unsafe { nearest_centroid(&p, 1.0, &centroids, k, nz!(D)) };
            // SAFETY: same preconditions.
            let (b, _) = unsafe { nearest_centroid(&p, 0.123, &centroids, k, nz!(D)) };
            assert_eq!(a, b, "inv_norm must not change the selected centroid");
        }
    }

    #[test]
    fn cluster_mixed_zero_norm_rows() {
        // Some all-zero rows exercise the inv_norm == 0 path in accumulation
        // and the squared_chord_distance == 0 return.
        let n = 120;
        let mut data = vec![0.0_f32; n * 8];
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(7);
        for (i, row) in data.chunks_exact_mut(8).enumerate() {
            if i % 10 == 0 {
                continue; // leave all-zero
            }
            for v in row.iter_mut() {
                *v = rng.random_range(-1.0..1.0);
            }
        }
        let result = cluster(&data, dim(8), &Config::for_k_with_seed(5, 1));

        assert!(result.centroids.iter().all(|v| v.is_finite()));
        assert!(result.labels.iter().all(|&l| l < 5));
    }

    /// Sequential reference for [`accumulate_clusters`]: one pass over the
    /// points in ascending index order, adding each to its cluster's sum
    /// with the same kernels. Bit-identical to the parallel version by
    /// construction if (and only if) the grouping preserves per-cluster
    /// ascending order, which is exactly the property under test.
    fn accumulate_reference(
        points: &[f32],
        labels: &[u16],
        inv_norms: Option<&[f32]>,
        k: usize,
        d: usize,
    ) -> (Vec<f32>, Vec<usize>) {
        let mut sums = vec![0.0_f32; k * d];
        let mut counts = vec![0_usize; k];

        for (index, (point, &label)) in points.chunks_exact(d).zip(labels).enumerate() {
            let cluster = usize::from(label);
            counts[cluster] += 1;

            let inv_norm = inv_norms.map_or_else(
                || {
                    // SAFETY: `point` has length `d`, a multiple of 8.
                    let norm = unsafe { kernel::dot(point, point) }.sqrt();

                    if norm > 0.0 { norm.recip() } else { 0.0 }
                },
                |inv_norms| inv_norms[index],
            );

            if inv_norm == 0.0 {
                continue;
            }

            // SAFETY: sum rows and `point` have length `d`, a multiple of 8.
            unsafe {
                kernel::add_scaled_into(&mut sums[cluster * d..(cluster + 1) * d], point, inv_norm);
            }
        }

        (sums, counts)
    }

    #[test]
    fn accumulate_clusters_matches_sequential_reference_bitwise() {
        // Half the points land in cluster 0 (skew), the rest spread over
        // 1..=5; cluster 6 stays empty.
        const PATTERN: [u16; 10] = [0, 1, 0, 2, 0, 3, 0, 4, 0, 5];
        let n = 203;
        let d = 32;
        let k = 7_usize;

        let mut rng = Xoshiro256PlusPlus::seed_from_u64(31);
        let mut points = vec![0.0_f32; n * d];
        for (i, row) in points.chunks_exact_mut(d).enumerate() {
            if i % 17 == 0 {
                continue; // leave all-zero: counted, but contributes nothing
            }
            for v in row.iter_mut() {
                *v = rng.random_range(-1.0..1.0);
            }
        }

        let labels: Vec<u16> = (0..n).map(|i| PATTERN[i % PATTERN.len()]).collect();

        let inv_norms: Vec<f32> = points
            .chunks_exact(d)
            .map(|row| {
                let norm = l2(row);
                if norm > 0.0 { norm.recip() } else { 0.0 }
            })
            .collect();

        for inv in [None, Some(inv_norms.as_slice())] {
            // Sentinels: the accumulator must overwrite all of its outputs.
            let mut sums = vec![f32::NAN; k * d];
            let mut counts = vec![usize::MAX; k];
            let mut order = vec![usize::MAX; n];
            let mut bounds = vec![usize::MAX; k + 1];

            let mut scratch = Scratch {
                sums: &mut sums,
                counts: &mut counts,
                order: &mut order,
                bounds: &mut bounds,
            };

            // SAFETY: `points` is `n * d` floats with `n` labels, all labels
            // are drawn from `PATTERN` and below `k == 7`, sums are `k * d`
            // with `k` counts, inv norms (when provided) have one entry per
            // label, order has `n` entries, bounds has `k + 1`, and
            // `d == 32` is a multiple of 8.
            unsafe {
                accumulate_clusters(&points, &labels, inv, &mut scratch, nz!(32));
            }

            let (expected_sums, expected_counts) =
                accumulate_reference(&points, &labels, inv, k, d);

            assert_eq!(counts, expected_counts);
            assert_eq!(counts[6], 0, "cluster 6 must stay empty");
            assert_eq!(counts.iter().sum::<usize>(), n, "every point counted");

            for (i, (sum, expected)) in sums.iter().zip(&expected_sums).enumerate() {
                assert_eq!(
                    sum.to_bits(),
                    expected.to_bits(),
                    "sums diverge at element {i}: {sum} vs {expected}"
                );
            }
        }
    }

    /// The determinism contract: identical bits regardless of pool width.
    /// Guards the accumulate/assignment structure against rewrites whose
    /// float reduction order depends on rayon's scheduling.
    #[test]
    fn cluster_bitwise_identical_across_pool_sizes() {
        let (data, _) = make_blobs::<8>(40, 4, 2024);
        let config = Config::for_k_with_seed(4, 7);

        let single = rayon::ThreadPoolBuilder::new()
            .num_threads(1)
            .build()
            .expect("single-thread pool should build")
            .install(|| cluster(&data, dim(8), &config));
        let multi = rayon::ThreadPoolBuilder::new()
            .num_threads(8)
            .build()
            .expect("multi-thread pool should build")
            .install(|| cluster(&data, dim(8), &config));

        assert_eq!(single.labels, multi.labels);
        assert_eq!(single.centroids, multi.centroids);
    }
}
