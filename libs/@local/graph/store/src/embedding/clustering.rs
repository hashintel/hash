use alloc::borrow::Cow;
use core::{cmp, mem, num::NonZero};

use rand::{Rng, RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;
use rayon::prelude::*;

use super::{dimension::Dimension, kernel};

/// Parameters for k-means clustering.
///
/// Use [`Config::for_k`] or [`Config::for_k_with_seed`] to construct with
/// reasonable defaults, then override individual fields as needed.
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

    /// Base seed for the PRNG. Each restart derives its own seed from this.
    pub seed: u64,

    /// Number of points processed per batch in the assignment step.
    pub chunk: NonZero<usize>,
}

impl Config {
    /// Creates a configuration for `k` clusters, drawing the seed from `rng`.
    #[must_use]
    pub(crate) fn for_k(k: u16, mut rng: impl Rng) -> Self {
        Self::for_k_with_seed(k, rng.random())
    }

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
    pub centroids: Box<[f32]>,

    /// Cluster assignment for each input point, values in `0..k`.
    pub labels: Box<[u16]>,
}

impl Clustering {
    /// Allocates a zeroed clustering for `k` centroids over `n` points.
    fn new(k: u16, n: usize, d: Dimension) -> Self {
        // SAFETY: All-zero bits are valid for `f32` (IEEE 754 positive zero)
        // and for `u16` (the integer 0). `Box::new_zeroed_slice` allocates
        // zeroed memory of the correct layout, so `assume_init` is sound.
        let centroids: Box<[f32]> =
            unsafe { Box::new_zeroed_slice((k as usize) * (d.get() as usize)).assume_init() };
        // SAFETY: All-zero bits are valid for `u16` (the integer 0).
        let labels: Box<[u16]> = unsafe { Box::new_zeroed_slice(n).assume_init() };

        Self {
            centroids,
            labels,
            dimension: d,
        }
    }

    /// Returns the `D`-dimensional slice for centroid `cluster`.
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
    #[must_use]
    pub fn label(&self, entity: usize) -> u16 {
        self.labels[entity]
    }

    /// Returns a mutable reference to the cluster label for point `entity`.
    fn label_mut(&mut self, entity: usize) -> &mut u16 {
        &mut self.labels[entity]
    }
}

// TODO: I wonder if we can make this allocation less
fn sample_indices(n: usize, m: usize, mut rng: impl Rng) -> Vec<usize> {
    let mut idx: Vec<usize> = (0..n).collect();

    for i in 0..m {
        let j = i + rng.random_range(0..n - i); // partial Fisher–Yates
        idx.swap(i, j);
    }

    idx.truncate(m);
    idx
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
/// * `point.len() == D`
/// * `centroids.len() == k * D`
/// * `k > 0`
/// * `D` is a multiple of 8 (enforced at compile time by the const generic).
#[inline]
#[must_use]
pub(crate) unsafe fn nearest_centroid(
    point: &[f32],
    point_inv_norm: f32,
    centroids: &[f32],
    k: usize,
    d: usize,
) -> (u16, f32) {
    debug_assert_eq!(point.len(), d);
    debug_assert_eq!(centroids.len(), k * d);
    debug_assert!(k > 0);

    // SAFETY: the caller guarantees these preconditions. The hints let the
    // compiler elide bounds checks on the centroid slicing inside the loop.
    unsafe {
        core::hint::assert_unchecked(point.len() == d);
        core::hint::assert_unchecked(centroids.len() == k * d);
        core::hint::assert_unchecked(d.is_multiple_of(8));
        core::hint::assert_unchecked(k > 0);
    }

    let mut best = 0;
    let mut best_dot = f32::NEG_INFINITY;

    for cluster in 0..k {
        let start = cluster * d;
        let centroid = &centroids[start..start + d];

        // SAFETY: `point` and `centroid` both have length `D`, and `D` is a
        // multiple of 8 (guaranteed by Dimension).
        let dot = unsafe { kernel::dot(point, centroid) };

        #[expect(
            clippy::cast_possible_truncation,
            reason = "k is supposed to be low, and checked as such via the config"
        )]
        if dot > best_dot {
            best = cluster as u16;
            best_dot = dot;
        }
    }

    (best, squared_chord_distance(best_dot, point_inv_norm))
}

/// Pre-allocated scratch space for the k-means fitting loop.
///
/// All buffers are allocated once and reused across restarts to avoid
/// per-iteration allocation overhead.
struct Fit {
    k: usize,
    m: usize,
    d: usize,

    /// Current centroids for this restart, `k * d` elements.
    centroids: Box<[f32]>,
    /// Best centroids seen across all restarts.
    best_centroids: Box<[f32]>,
    /// Per-cluster accumulator for centroid recomputation, `k * d` elements.
    sums: Box<[f32]>,
    /// Per-cluster point count for centroid averaging.
    counts: Box<[usize]>,
    /// Per-sample-point cluster assignment.
    labels: Box<[u16]>,
    /// Per-sample-point closest centroid distance (for k-means++ seeding).
    closest_distances: Box<[f32]>,
    /// Tracks which sample points have been selected as seeds.
    selected: Box<[bool]>,
    /// Lowest inertia across all restarts.
    best_inertia: f32,
}

impl Fit {
    fn new(k: usize, m: usize, d: usize) -> Self {
        // SAFETY: all-zero bits are valid for f32 (IEEE 754 +0.0), usize (0), u16 (0), and bool
        // (false). `Box::new_zeroed_slice` allocates zeroed memory of the correct layout
        // for each type, so `assume_init` is sound in every case.
        let centroids = unsafe { Box::<[f32]>::new_zeroed_slice(k * d).assume_init() };
        // SAFETY: see above
        let best_centroids = unsafe { Box::<[f32]>::new_zeroed_slice(k * d).assume_init() };
        // SAFETY: see above
        let sums = unsafe { Box::<[f32]>::new_zeroed_slice(k * d).assume_init() };
        // SAFETY: see above
        let counts = unsafe { Box::<[usize]>::new_zeroed_slice(k).assume_init() };
        // SAFETY: see above
        let labels = unsafe { Box::<[u16]>::new_zeroed_slice(m).assume_init() };
        // SAFETY: see above
        let closest_distances = unsafe { Box::<[f32]>::new_zeroed_slice(m).assume_init() };
        // SAFETY: see above
        let selected = unsafe { Box::<[bool]>::new_zeroed_slice(m).assume_init() };
        let best_inertia = f32::INFINITY;

        Self {
            k,
            m,
            d,
            centroids,
            best_centroids,
            sums,
            counts,
            labels,
            closest_distances,
            selected,
            best_inertia,
        }
    }

    fn reset_centroids(&mut self) {
        self.centroids.fill(0.0);
    }

    fn reset_sums(&mut self) {
        self.sums.fill(0.0);
    }

    fn reset_counts(&mut self) {
        self.counts.fill(0);
    }

    fn reset_selected(&mut self) {
        self.selected.fill(false);
    }

    /// Reinitializes empty clusters from the sample point farthest from
    /// its assigned centroid.
    ///
    /// For each empty cluster, scans the sample to find the point with
    /// the largest squared chord distance to its current centroid, copies
    /// that point as the new centroid (normalized), and updates the
    /// point's label so it won't be picked again for subsequent empty
    /// clusters in the same pass.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "cluster index < k, and k originates from Config::k (u16)"
    )]
    fn reinit_empty_clusters(&mut self, sample: &[f32], sample_inv_norms: &[f32]) -> bool {
        let &mut Self { d, k, .. } = self;

        let mut reseeded = false;

        for cluster in 0..k {
            if self.counts[cluster] != 0 {
                continue;
            }

            reseeded = true;
            let mut farthest_idx = 0;
            let mut farthest_dist = -1.0_f32;

            for (i, (point, &inv_norm)) in sample.chunks_exact(d).zip(sample_inv_norms).enumerate()
            {
                let label = usize::from(self.labels[i]);
                let c_start = label * d;

                // SAFETY: point and centroid both have length `d`,
                // a multiple of 8 (guaranteed by Dimension).
                let dot = unsafe { kernel::dot(point, &self.centroids[c_start..c_start + d]) };
                let dist = squared_chord_distance(dot, inv_norm);

                if dist > farthest_dist {
                    farthest_dist = dist;
                    farthest_idx = i;
                }
            }

            let point_start = farthest_idx * d;
            let centroid_start = cluster * d;
            self.centroids[centroid_start..centroid_start + d]
                .copy_from_slice(&sample[point_start..point_start + d]);

            // SAFETY: centroid row has length `d`, a multiple of 8.
            unsafe {
                kernel::normalize(&mut self.centroids[centroid_start..centroid_start + d]);
            }

            // Update the label so the next empty cluster picks a different
            // point (this point's distance to its new centroid is ~0).
            self.labels[farthest_idx] = cluster as u16;
        }

        reseeded
    }

    /// Runs k-means++ initialization followed by Lloyd iterations on the
    /// sample, repeating for `n_init` restarts. The best centroids (lowest
    /// inertia) are stored in `self.best_centroids`.
    fn run(
        &mut self,
        sample: &[f32],
        chunk: usize,
        row_chunk: usize,
        sample_inv_norms: &[f32],
        mut rng: impl Rng,
        config: &Config,
    ) {
        for _ in 0..config.n_init.get() {
            self.reset_centroids();
            self.closest_distances.fill(f32::INFINITY);
            self.reset_selected();

            self.seed_plusplus(sample, sample_inv_norms, &mut rng);

            let inertia = self.lloyd(sample, chunk, row_chunk, sample_inv_norms, config);

            if inertia < self.best_inertia {
                self.best_inertia = inertia;
                mem::swap(&mut self.best_centroids, &mut self.centroids);
            }
        }
    }

    /// Runs Lloyd iterations on the sample until convergence or `max_iters`.
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
            inertia = sample
                .par_chunks(row_chunk)
                .zip(sample_inv_norms.par_chunks(chunk))
                .zip(self.labels.par_chunks_mut(chunk))
                .map(|((points, inv_norms), labels)| {
                    let mut inertia = 0.0;
                    let count = labels.len();

                    // SAFETY: each parallel chunk pairs `count` labels with
                    // `count * d` floats of point data and `count` inv_norms.
                    // `d` is a multiple of 8 (guaranteed by Dimension).
                    unsafe {
                        core::hint::assert_unchecked(points.len() == count * d);
                        core::hint::assert_unchecked(inv_norms.len() == count);
                        core::hint::assert_unchecked(d.is_multiple_of(8));
                    }

                    let mut i = 0;
                    while i + 4 <= count {
                        let p0 = &points[i * d..i * d + d];
                        let p1 = &points[(i + 1) * d..(i + 1) * d + d];
                        let p2 = &points[(i + 2) * d..(i + 2) * d + d];
                        let p3 = &points[(i + 3) * d..(i + 3) * d + d];

                        // SAFETY: each point length d, centroids length k*d,
                        // k > 0, d a multiple of 8 (guaranteed by Dimension).
                        let nearest =
                            unsafe { kernel::nearest4(p0, p1, p2, p3, &self.centroids, k, d) };

                        let inv = [
                            inv_norms[i],
                            inv_norms[i + 1],
                            inv_norms[i + 2],
                            inv_norms[i + 3],
                        ];
                        for m in 0..4 {
                            labels[i + m] = nearest[m].0;
                            inertia += squared_chord_distance(nearest[m].1, inv[m]);
                        }
                        i += 4;
                    }

                    while i < count {
                        let point = &points[i * d..i * d + d];
                        // SAFETY: point length d, centroids length k*d, k > 0,
                        // d mult of 8.
                        let (label, distance) =
                            unsafe { nearest_centroid(point, inv_norms[i], &self.centroids, k, d) };
                        labels[i] = label;
                        inertia += distance;
                        i += 1;
                    }

                    inertia
                })
                .sum();

            self.reset_sums();
            self.reset_counts();

            for ((point, label), inv_norm) in sample
                .chunks_exact(d)
                .zip(self.labels.iter().copied())
                .zip(sample_inv_norms.iter().copied())
            {
                let cluster = usize::from(label);
                let start = cluster * d;

                self.counts[cluster] += 1;

                if inv_norm == 0.0 {
                    continue;
                }

                // SAFETY: `sums[start..start + d]` and `point` both have
                // length `d`, and `d` is a multiple of 8 (guaranteed by Dimension).
                unsafe {
                    kernel::add_scaled_into(&mut self.sums[start..start + d], point, inv_norm);
                }
            }

            for cluster in 0..k {
                if self.counts[cluster] == 0 {
                    continue;
                }

                let start = cluster * d;
                let centroid = &mut self.centroids[start..start + d];
                let sum = &self.sums[start..start + d];

                // SAFETY: `centroid` and `sum` both have length `D`, and `D`
                // is a multiple of 8 (guaranteed by Dimension).
                unsafe {
                    #[expect(
                        clippy::cast_precision_loss,
                        reason = "cluster count is bounded by sample_cap (≤8192), well within f32 \
                                  precision"
                    )]
                    let inv_count = 1.0 / self.counts[cluster] as f32;
                    kernel::scale_into(centroid, sum, inv_count);
                }

                // SAFETY: centroid rows have length `D`, and `D` is a
                // multiple of 8 (guaranteed by Dimension).
                unsafe {
                    kernel::normalize(centroid);
                }
            }

            let reseeded = self.reinit_empty_clusters(sample, sample_inv_norms);

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

    /// k-means++ D² weighted seeding. Picks `k` initial centroids from the
    /// sample, each chosen with probability proportional to its squared
    /// distance from the nearest already-chosen centroid.
    fn seed_plusplus(&mut self, sample: &[f32], sample_inv_norms: &[f32], mut rng: impl Rng) {
        let &mut Self { d, k, m, .. } = self;

        let mut restart_rng = Xoshiro256PlusPlus::seed_from_u64(rng.random());
        let mut point = restart_rng.random_range(0..m);

        for cluster in 0..k {
            let centroid_start = cluster * d;
            let point_start = point * d;

            self.centroids[centroid_start..centroid_start + d]
                .copy_from_slice(&sample[point_start..point_start + d]);

            // SAFETY: centroid rows have length `D`, and `D` is a multiple of 8 (guaranteed by
            // Dimension).
            unsafe {
                kernel::normalize(&mut self.centroids[centroid_start..centroid_start + d]);
            }

            self.selected[point] = true;

            let centroid = &self.centroids[centroid_start..centroid_start + d];

            let total: f32 = sample
                .par_chunks_exact(d)
                .zip(sample_inv_norms.par_iter().copied())
                .zip(self.closest_distances.par_iter_mut())
                .enumerate()
                .map(|(index, ((point, inv_norm), closest))| {
                    if self.selected[index] {
                        *closest = 0.0;
                        return 0.0;
                    }

                    // SAFETY: `point` and `centroid` both have length `D`, and
                    // `D` is a multiple of 8 (guaranteed by Dimension).
                    let dot = unsafe { kernel::dot(point, centroid) };
                    let distance = squared_chord_distance(dot, inv_norm);

                    if distance < *closest {
                        *closest = distance;
                    }

                    *closest
                })
                .sum();

            if cluster + 1 == k {
                break;
            }

            point = if total.is_finite() && total > 0.0 {
                let mut target = restart_rng.random_range(0.0..total);
                let mut sampled = self
                    .closest_distances
                    .iter()
                    .rposition(|distance| *distance > 0.0)
                    .unwrap_or(0);

                for (index, distance) in self.closest_distances.iter().copied().enumerate() {
                    if distance <= 0.0 {
                        continue;
                    }

                    target -= distance;

                    if target <= 0.0 {
                        sampled = index;
                        break;
                    }
                }

                sampled
            } else {
                let remaining = self.selected.iter().filter(|selected| !**selected).count();
                let mut target = restart_rng.random_range(0..remaining);
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
}

/// Per-thread accumulator for parallel centroid recomputation.
///
/// Each rayon task gets its own `Accum`; they are merged via [`Accum::merge`]
/// after the parallel fold completes.
struct Accum {
    /// Per-cluster sum of normalized points, `k * d` elements.
    sums: Box<[f32]>,
    /// Per-cluster point count.
    counts: Box<[usize]>,
}

impl Accum {
    fn new(k: usize, d: usize) -> Self {
        // SAFETY: all-zero bits are valid for f32 (0.0) and usize (0). `assume_init` is
        // sound after `new_zeroed_slice`.
        let sums = unsafe { Box::<[f32]>::new_zeroed_slice(k * d).assume_init() };
        // SAFETY: see above
        let counts = unsafe { Box::<[usize]>::new_zeroed_slice(k).assume_init() };
        Self { sums, counts }
    }

    fn merge(mut self, other: &Self, k: usize, d: usize) -> Self {
        for cluster in 0..k {
            let start = cluster * d;

            self.counts[cluster] += other.counts[cluster];

            // SAFETY: both cluster sum rows have length `d`, and `d` is a
            // multiple of 8 (guaranteed by Dimension).
            unsafe {
                kernel::add_into(
                    &mut self.sums[start..start + d],
                    &other.sums[start..start + d],
                );
            }
        }

        self
    }
}

/// Assigns all `n` points to their nearest centroid, recomputes centroids
/// from the full population, and re-assigns labels to the final centroids.
///
/// Uses a parallel fold/reduce: each rayon task accumulates into its own
/// [`Accum`], then results are merged. The final centroids are averaged
/// and normalized in-place.
///
/// # Safety
///
/// * `x.len() == n * D` for some `n`
/// * `clustering.centroids.len() == k * D`
/// * `clustering.labels.len() == n`
/// * `k > 0`
/// * `D` is a multiple of 8 (guaranteed by Dimension)
unsafe fn assign(x: &[f32], clustering: &mut Clustering, k: usize, chunk: usize, row_chunk: usize) {
    let d = clustering.dimension.get() as usize;

    let full = x
        .par_chunks(row_chunk)
        .zip(clustering.labels.par_chunks_mut(chunk))
        .fold(
            || Accum::new(k, d),
            |mut accum, (points, labels)| {
                // SAFETY: `cluster` established `x.len() == n * D` and
                // `centroids.len() == k * D`. `par_chunks(row_chunk)` with
                // `row_chunk = chunk * D` produces chunks where
                // `points.len()` is a multiple of `D` and matches `labels.len() * D`.
                unsafe {
                    assign_chunk(&clustering.centroids, k, d, points, labels, &mut accum);
                }

                accum
            },
        )
        .reduce(|| Accum::new(k, d), |lhs, rhs| lhs.merge(&rhs, k, d));

    for cluster in 0..k {
        if full.counts[cluster] == 0 {
            continue;
        }

        let start = cluster * d;

        #[expect(
            clippy::cast_possible_truncation,
            reason = "cluster < k and k originates from Config::k (u16)"
        )]
        let centroid = clustering.centroid_mut(cluster as u16);
        let sum = &full.sums[start..start + d];

        // SAFETY: centroid and sum both length D, a multiple of 8.
        unsafe {
            #[expect(
                clippy::cast_precision_loss,
                reason = "cluster count bounded by n; precision loss acceptable for averaging"
            )]
            let inv_count = 1.0 / full.counts[cluster] as f32;
            kernel::scale_into(centroid, sum, inv_count);
        }
        // SAFETY: centroid length D, a multiple of 8.
        unsafe {
            kernel::normalize(centroid);
        }
    }

    // SAFETY: centroids were just recomputed; same invariants hold.
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
}

/// Processes one parallel chunk of the assignment step: finds the nearest
/// centroid for each point, accumulates normalized points into cluster sums,
/// and records labels.
///
/// # Safety
///
/// * `points.len() == labels.len() * d`
/// * `centroids.len() >= k * d`
/// * `d` is a multiple of 8
/// * `k > 0`
/// * `accum.sums.len() >= k * d` and `accum.counts.len() >= k`
unsafe fn assign_chunk(
    centroids: &[f32],
    k: usize,
    d: usize,
    points: &[f32],
    labels: &mut [u16],
    accum: &mut Accum,
) {
    // field path -> disjoint capture of `centroids` only, leaving
    // `labels` free for the mutable parallel borrow.
    let count = labels.len();

    // SAFETY: each parallel chunk pairs `count` labels with
    // `count * D` floats of point data. `D` is a compile-time
    // multiple of 8.
    unsafe {
        core::hint::assert_unchecked(points.len() == count * d);
        core::hint::assert_unchecked(d.is_multiple_of(8));
    }

    let mut i = 0;
    while i + 4 <= count {
        let p0 = &points[i * d..i * d + d];
        let p1 = &points[(i + 1) * d..(i + 1) * d + d];
        let p2 = &points[(i + 2) * d..(i + 2) * d + d];
        let p3 = &points[(i + 3) * d..(i + 3) * d + d];

        // SAFETY: each point length D, centroids length k*D, k > 0, D a multiple of 8 (guaranteed
        // by Dimension).
        let nearest = unsafe { kernel::nearest4(p0, p1, p2, p3, centroids, k, d) };
        let ps = [p0, p1, p2, p3];

        for m in 0..4 {
            let label = nearest[m].0;
            labels[i + m] = label;
            let cluster = usize::from(label);
            accum.counts[cluster] += 1;

            let start = cluster * d;

            // SAFETY: point length D, a multiple of 8.
            let norm = unsafe { kernel::dot(ps[m], ps[m]).sqrt() };
            if norm == 0.0 {
                continue;
            }

            // SAFETY: `sums[start..start + D]` and `point` both have length `D`, and `D` is a
            // multiple of 8 (guaranteed by Dimension).
            unsafe {
                kernel::add_scaled_into(&mut accum.sums[start..start + d], ps[m], norm.recip());
            }
        }
        i += 4;
    }

    while i < count {
        let point = &points[i * d..i * d + d];
        // SAFETY: point length D, centroids length k*D, k > 0, D mult of 8.
        let (label, _) = unsafe { nearest_centroid(point, 1.0, centroids, k, d) };
        labels[i] = label;
        let cluster = usize::from(label);
        accum.counts[cluster] += 1;

        let start = cluster * d;

        // SAFETY: point length D.
        let norm = unsafe { kernel::dot(point, point).sqrt() };
        if norm != 0.0 {
            // SAFETY: `sums[start..start + D]` and `point` both
            // have length `D`, and `D` is a multiple of 8.
            unsafe {
                kernel::add_scaled_into(&mut accum.sums[start..start + d], point, norm.recip());
            }
        }
        i += 1;
    }
}

/// Processes one parallel chunk of the reassignment step: updates each
/// label to the nearest final centroid.
///
/// # Safety
///
/// * `points.len() == labels.len() * d`
/// * `centroids.len() >= k * d`
/// * `d` is a multiple of 8
/// * `k > 0`
unsafe fn reassign_chunk(
    k: usize,
    d: usize,
    centroids: &[f32],
    points: &[f32],
    labels: &mut [u16],
) {
    let count = labels.len();

    // SAFETY: each parallel chunk pairs `count` labels with
    // `count * D` floats of point data. `D` is a compile-time
    // multiple of 8.
    unsafe {
        core::hint::assert_unchecked(points.len() == count * d);
        core::hint::assert_unchecked(d.is_multiple_of(8));
    }

    let mut i = 0;
    while i + 4 <= count {
        let p0 = &points[i * d..i * d + d];
        let p1 = &points[(i + 1) * d..(i + 1) * d + d];
        let p2 = &points[(i + 2) * d..(i + 2) * d + d];
        let p3 = &points[(i + 3) * d..(i + 3) * d + d];

        // SAFETY: each point length D, centroids length k*D, k > 0,
        // D a multiple of 8 (guaranteed by Dimension).
        let nearest = unsafe { kernel::nearest4(p0, p1, p2, p3, centroids, k, d) };

        labels[i] = nearest[0].0;
        labels[i + 1] = nearest[1].0;
        labels[i + 2] = nearest[2].0;
        labels[i + 3] = nearest[3].0;
        i += 4;
    }

    while i < count {
        let point = &points[i * d..i * d + d];
        // SAFETY: point length D, centroids length k*D, k > 0, D mult of 8.
        let (label, _) = unsafe { nearest_centroid(point, 1.0, centroids, k, d) };
        labels[i] = label;
        i += 1;
    }
}

/// Re-assigns labels to the nearest final centroid.
///
/// After centroid recomputation, some boundary points may no longer be
/// nearest to the centroid stored under their label. This pass fixes that.
///
/// # Safety
///
/// Same as [`assign`].
unsafe fn reassign(
    x: &[f32],
    centroids: &[f32],
    labels: &mut [u16],
    k: usize,
    d: usize,
    chunk: usize,
    row_chunk: usize,
) {
    x.par_chunks(row_chunk)
        .zip(labels.par_chunks_mut(chunk))
        .for_each(|(points, labels)| {
            // SAFETY: `par_chunks(row_chunk)` with `row_chunk = chunk * D`
            // ensures `points.len() == labels.len() * D`. Centroids and k
            // are valid from the caller.
            unsafe {
                reassign_chunk(k, d, centroids, points, labels);
            }
        });
}

/// Runs spherical k-means over a flat row-major embedding matrix.
///
/// `x` contains `n` points of `dimension` floats each, laid out
/// contiguously. Returns cluster assignments and unit-normalized centroids.
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

    if k == 0 {
        return clustering;
    }

    let k = usize::from(k);
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(config.seed);

    // 1. subsample (fit on all of n only when n is already small)
    let m = config.sample_cap.max(k).min(n);

    let sample = if m == n {
        Cow::Borrowed(x)
    } else {
        let indices = sample_indices(n, m, &mut rng);
        let mut sampled = vec![0_f32; m * d];

        let chunks = sampled.chunks_mut(d);
        assert_eq!(chunks.len(), indices.len());

        for (chunk, index) in chunks.zip(indices) {
            chunk.copy_from_slice(&x[index * d..(index + 1) * d]);
        }

        Cow::Owned(sampled)
    };

    let sample = sample.as_ref();
    let chunk = config.chunk.get();
    let row_chunk = chunk
        .checked_mul(d)
        .unwrap_or_else(|| usize::MAX - (usize::MAX % d))
        .max(d);

    let sample_inv_norms: Vec<f32> = sample
        .par_chunks_exact(d)
        .map(|point| {
            // SAFETY: every point is a `d`-sized row, and `d` is a multiple of 8 (guaranteed by
            // Dimension).
            let norm = unsafe { kernel::dot(point, point).sqrt() };

            if norm > 0.0 { norm.recip() } else { 0.0 }
        })
        .collect();

    // 2. fit on the sample, best of n_init restarts (guards against bad initializations)
    let mut fit = Fit::new(k, m, d);
    fit.run(sample, chunk, row_chunk, &sample_inv_norms, rng, config);
    mem::swap(&mut clustering.centroids, &mut fit.best_centroids);

    // 3. assign points to clusters
    // SAFETY: `x.len() == n * d` (asserted above), `clustering.centroids.len() == k * d`,
    // `k > 0` (checked above), `d` is a multiple of 8 (guaranteed by Dimension).
    unsafe {
        assign(x, &mut clustering, k, chunk, row_chunk);
    }

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
    fn unit_random(k: usize, seed: u64) -> Vec<f32> {
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);
        let mut c = vec![0.0_f32; k * D];
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
    fn brute_nearest_cosine(point: &[f32], centroids: &[f32], k: usize) -> u16 {
        let pn = l2(point);
        let mut best = 0_u16;
        let mut best_cos = f32::NEG_INFINITY;
        for c in 0..k {
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
    fn cluster_empty_input() {
        let config = Config::for_k_with_seed(4, 42);
        let result = cluster(&[], dim(8), &config);
        assert_eq!(result.labels.len(), 0);
        assert_eq!(result.centroids.len(), 0);
    }

    #[test]
    fn cluster_k0() {
        let data = vec![1.0_f32; 8];
        let config = Config::for_k_with_seed(0, 42);
        let result = cluster(&data, dim(8), &config);
        assert_eq!(result.labels.len(), 1);
        assert_eq!(result.labels[0], 0);
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
    }

    #[test]
    fn cluster_different_seeds_may_differ() {
        let (data, _) = make_blobs::<8>(30, 3, 555);

        let r1 = cluster(&data, dim(8), &Config::for_k_with_seed(3, 42));
        let r2 = cluster(&data, dim(8), &Config::for_k_with_seed(3, 9999));

        // Not guaranteed to differ, but with well-separated blobs and
        // different seeds the label permutation usually differs.
        assert!(
            r1.labels != r2.labels,
            "different seeds produced identical label vectors (possible but unlikely)"
        );
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
        let k = 7;
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
            let (got, _) = unsafe { nearest_centroid(&p, inv, &centroids, k, D) };
            assert_eq!(
                got,
                brute_nearest_cosine(&p, &centroids, k),
                "mismatch for point norm={pn}"
            );
        }
    }

    #[test]
    fn nearest_centroid_argmax_independent_of_inv_norm() {
        let k = 5;
        let centroids = unit_random(k, 7);
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(8);

        for _ in 0..500 {
            let p: Vec<f32> = core::iter::repeat_with(|| rng.random_range(-2.0..2.0))
                .take(D)
                .collect();

            // SAFETY: point has length D=64, centroids has length k*D,
            // k > 0, D is a multiple of 8.
            let (a, _) = unsafe { nearest_centroid(&p, 1.0, &centroids, k, D) };
            // SAFETY: same preconditions.
            let (b, _) = unsafe { nearest_centroid(&p, 0.123, &centroids, k, D) };
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
}
