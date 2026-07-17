//! The production optimizer: row-partitioned, atomic, and rayon-parallel.

use core::sync::atomic::{AtomicU32, Ordering};

use super::{
    CurveParameters, UmapError, UmapOptions,
    kernel::{
        attractive_gradient_coefficient, clip, make_epochs_per_sample_f32, normalize_coordinates,
        optimizer_edges, per_vertex_random_states, repulsive_gradient_coefficient,
        squared_distance, tau_rand_int,
    },
    validate_optimizer_inputs,
};
use crate::projection::graph::SparseGraph;

/// Per-edge sampling schedule state, stored compactly in `f32`.
struct ParallelEdge {
    tail: u32,
    epochs_per_sample: f32,
    epochs_per_negative_sample: f32,
    epoch_of_next_sample: f32,
    epoch_of_next_negative_sample: f32,
}

/// A multi-threaded layout optimizer with safe atomic coordinate updates.
///
/// Edges are grouped by head vertex, and disjoint head ranges are optimized
/// on separate rayon tasks. Every coordinate write goes through a
/// compare-and-swap loop, so concurrent updates to a shared tail vertex never
/// tear or lose writes. The trade-off is that the interleaving of updates
/// depends on scheduling: repeated runs over identical input converge to
/// equivalent layouts (the conformance suite checks the fuzzy cross-entropy
/// objective) but are not bit-identical the way [`SerialOptimizer`] runs are.
///
/// [`SerialOptimizer`]: super::SerialOptimizer
pub(crate) struct ParallelOptimizer {
    coordinates: Vec<[AtomicU32; 2]>,
    row_offsets: Vec<u32>,
    edges: Vec<ParallelEdge>,
    random_states: Vec<[i64; 3]>,
    curve: CurveParameters,
    options: UmapOptions,
    epoch: usize,
    learning_rate: f64,
}

impl ParallelOptimizer {
    /// Prepares the optimizer state from a fuzzy graph and an initial layout.
    ///
    /// The initial coordinates are rescaled to `[0, 10]` per axis, weak edges
    /// are dropped following the oracle's retention threshold, and one tau
    /// RNG stream is seeded per vertex.
    ///
    /// # Errors
    ///
    /// Returns an error when the options or curve are invalid, when the graph
    /// is not square or does not match the layout length, when the graph has
    /// no positive finite edge weights, or when the initial coordinates are
    /// non-finite or collapsed onto a single point along an axis.
    pub(crate) fn new(
        graph: &SparseGraph,
        initial_coordinates: Vec<[f32; 2]>,
        curve: CurveParameters,
        options: UmapOptions,
        random_state: [i64; 3],
    ) -> Result<Self, UmapError> {
        let options = options.validate()?;
        CurveParameters::new(curve.a, curve.b)?;
        validate_optimizer_inputs(graph, &initial_coordinates)?;

        let coordinates = normalize_coordinates(initial_coordinates)?;
        let extracted = optimizer_edges(graph, options.epochs)?;
        let epochs_per_sample = make_epochs_per_sample_f32(&extracted.weights, options.epochs)?;
        #[expect(
            clippy::cast_precision_loss,
            reason = "the negative sample rate is a small count that fits f32 exactly"
        )]
        let negative_sample_rate = options.negative_sample_rate as f32;
        let edges = extracted
            .tails
            .into_iter()
            .zip(epochs_per_sample)
            .map(|(tail, epochs_per_sample)| {
                let epochs_per_negative_sample = epochs_per_sample / negative_sample_rate;
                ParallelEdge {
                    tail,
                    epochs_per_sample,
                    epochs_per_negative_sample,
                    epoch_of_next_sample: epochs_per_sample,
                    epoch_of_next_negative_sample: epochs_per_negative_sample,
                }
            })
            .collect();
        let random_states = per_vertex_random_states(&coordinates, random_state);
        let coordinates = coordinates
            .into_iter()
            .map(|[x, y]| [AtomicU32::new(x.to_bits()), AtomicU32::new(y.to_bits())])
            .collect();

        Ok(Self {
            coordinates,
            row_offsets: extracted.row_offsets,
            edges,
            random_states,
            curve,
            options,
            epoch: 0,
            learning_rate: options.initial_learning_rate,
        })
    }

    /// Copies the current layout out of the atomic storage, one `[x, y]` pair
    /// per graph row.
    pub(crate) fn coordinates(&self) -> Vec<[f32; 2]> {
        self.coordinates.iter().map(load_coordinate).collect()
    }

    /// The number of completed epochs.
    pub(crate) const fn epoch(&self) -> usize {
        self.epoch
    }

    /// Runs one optimization epoch across all rayon worker threads.
    ///
    /// Returns `Ok(false)` once the epoch budget is exhausted; further calls
    /// keep returning `Ok(false)` without touching the layout.
    #[expect(
        clippy::cast_precision_loss,
        reason = "the production schedule uses f32 because epoch counts and graph weights are f32"
    )]
    pub(crate) fn step(&mut self) -> Result<bool, UmapError> {
        if self.epoch >= self.options.epochs {
            return Ok(false);
        }

        optimize_rows(
            0,
            &self.row_offsets,
            &mut self.random_states,
            &mut self.edges,
            &self.coordinates,
            self.epoch as f32,
            self.learning_rate,
            self.curve,
            self.options.repulsion_strength,
        );

        self.learning_rate = self.options.initial_learning_rate
            * (1.0 - self.epoch as f64 / self.options.epochs as f64);
        self.epoch += 1;
        Ok(true)
    }

    /// Runs the remaining epochs to completion.
    pub(crate) fn run(&mut self) -> Result<(), UmapError> {
        while self.step()? {}
        Ok(())
    }
}

/// Optimizes a contiguous range of head rows, recursively splitting the range
/// across rayon until it is small enough to process sequentially.
///
/// Each recursion level owns a disjoint slice of RNG states and edge
/// schedules, so only the shared coordinates require atomic access.
#[expect(clippy::too_many_arguments, reason = "internal recursion kernel")]
fn optimize_rows(
    head_start: usize,
    row_offsets: &[u32],
    random_states: &mut [[i64; 3]],
    edges: &mut [ParallelEdge],
    coordinates: &[[AtomicU32; 2]],
    epoch: f32,
    learning_rate: f64,
    curve: CurveParameters,
    repulsion_strength: f64,
) {
    const SEQUENTIAL_ROWS: usize = 256;

    if random_states.len() > SEQUENTIAL_ROWS {
        let middle_row = random_states.len() / 2;
        let middle_edge = (row_offsets[middle_row] - row_offsets[0]) as usize;
        let (left_states, right_states) = random_states.split_at_mut(middle_row);
        let (left_edges, right_edges) = edges.split_at_mut(middle_edge);
        let left_offsets = &row_offsets[..=middle_row];
        let right_offsets = &row_offsets[middle_row..];

        rayon::join(
            || {
                optimize_rows(
                    head_start,
                    left_offsets,
                    left_states,
                    left_edges,
                    coordinates,
                    epoch,
                    learning_rate,
                    curve,
                    repulsion_strength,
                );
            },
            || {
                optimize_rows(
                    head_start + middle_row,
                    right_offsets,
                    right_states,
                    right_edges,
                    coordinates,
                    epoch,
                    learning_rate,
                    curve,
                    repulsion_strength,
                );
            },
        );
        return;
    }

    let edge_base = row_offsets[0];
    let vertices = coordinates.len() as u32;
    for (local_head, random_state) in random_states.iter_mut().enumerate() {
        let head = head_start + local_head;
        let start = (row_offsets[local_head] - edge_base) as usize;
        let stop = (row_offsets[local_head + 1] - edge_base) as usize;

        for edge in &mut edges[start..stop] {
            if edge.epoch_of_next_sample > epoch {
                continue;
            }

            let tail = edge.tail as usize;
            let current = load_coordinate(&coordinates[head]);
            let other = load_coordinate(&coordinates[tail]);
            let distance_squared = squared_distance(current, other);
            let coefficient = attractive_gradient_coefficient(distance_squared, curve);
            for axis in 0..2 {
                let difference = f64::from(current[axis] - other[axis]);
                let gradient = clip(coefficient * difference) * learning_rate;
                atomic_add(&coordinates[head][axis], gradient);
                atomic_add(&coordinates[tail][axis], -gradient);
            }

            edge.epoch_of_next_sample += edge.epochs_per_sample;
            #[expect(
                clippy::cast_possible_truncation,
                reason = "the schedule bounds pending negative samples well below i32::MAX"
            )]
            let negative_samples = ((epoch - edge.epoch_of_next_negative_sample)
                / edge.epochs_per_negative_sample) as i32;
            for _ in 0..negative_samples.max(0) {
                let random = tau_rand_int(random_state);
                let vertex = i64::from(random).rem_euclid(i64::from(vertices)) as u32;
                let vertex = vertex as usize;
                if vertex == head {
                    continue;
                }

                let current = load_coordinate(&coordinates[head]);
                let other = load_coordinate(&coordinates[vertex]);
                let distance_squared = squared_distance(current, other);
                let coefficient =
                    repulsive_gradient_coefficient(distance_squared, curve, repulsion_strength);
                // A non-positive coefficient contributes a zero gradient (see
                // `repulsive_gradient`); skip the CAS loops instead of adding zero.
                if coefficient > 0.0 {
                    for axis in 0..2 {
                        let difference = f64::from(current[axis] - other[axis]);
                        let gradient = clip(coefficient * difference) * learning_rate;
                        atomic_add(&coordinates[head][axis], gradient);
                    }
                }
            }
            #[expect(
                clippy::cast_precision_loss,
                reason = "pending negative sample counts are small enough for exact f32"
            )]
            {
                edge.epoch_of_next_negative_sample +=
                    negative_samples as f32 * edge.epochs_per_negative_sample;
            }
        }
    }
}

/// Loads one coordinate pair out of the atomic bit storage.
fn load_coordinate(coordinate: &[AtomicU32; 2]) -> [f32; 2] {
    [
        f32::from_bits(coordinate[0].load(Ordering::Relaxed)),
        f32::from_bits(coordinate[1].load(Ordering::Relaxed)),
    ]
}

/// Adds `difference` to an `f32` stored as atomic bits.
///
/// The compare-and-swap loop retries until the addition lands on the value it
/// was computed from, so concurrent updates are never lost. Ordering is
/// relaxed: stochastic gradient descent tolerates reading slightly stale
/// coordinates, and the epoch barrier between steps orders everything that
/// must be ordered.
#[expect(
    clippy::cast_possible_truncation,
    reason = "coordinates are stored in f32 precision by design"
)]
fn atomic_add(coordinate: &AtomicU32, difference: f64) {
    let mut current = coordinate.load(Ordering::Relaxed);
    loop {
        let updated = (f64::from(f32::from_bits(current)) + difference) as f32;
        match coordinate.compare_exchange_weak(
            current,
            updated.to_bits(),
            Ordering::Relaxed,
            Ordering::Relaxed,
        ) {
            Ok(_) => break,
            Err(actual) => current = actual,
        }
    }
}
