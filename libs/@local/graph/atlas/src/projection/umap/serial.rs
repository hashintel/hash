//! The serial reference optimizer that mirrors `umap-learn` epoch for epoch.

use super::{
    CurveParameters, UmapError, UmapOptions,
    kernel::{
        attractive_gradient_coefficient, clip, make_epochs_per_sample, normalize_coordinates,
        optimizer_edges, per_vertex_random_states, repulsive_gradient,
        repulsive_gradient_coefficient, squared_distance, tau_rand_int,
    },
    validate_optimizer_inputs,
};
use crate::projection::graph::SparseGraph;

/// A single-threaded layout optimizer that reproduces the pinned `umap-learn`
/// oracle.
///
/// Every schedule, update order, and random draw matches the oracle's numba
/// kernel, which is what the conformance fixtures assert against. Use
/// [`ParallelOptimizer`] for production fitting; this optimizer exists to
/// prove the shared kernel pieces behave identically before they are
/// parallelized.
///
/// [`ParallelOptimizer`]: super::ParallelOptimizer
pub(crate) struct SerialOptimizer {
    coordinates: Vec<[f32; 2]>,
    head: Vec<u32>,
    tail: Vec<u32>,
    epochs_per_sample: Vec<f64>,
    epochs_per_negative_sample: Vec<f64>,
    epoch_of_next_sample: Vec<f64>,
    epoch_of_next_negative_sample: Vec<f64>,
    random_states: Vec<[i64; 3]>,
    #[cfg(test)]
    random_calls: Vec<u32>,
    curve: CurveParameters,
    options: UmapOptions,
    epoch: usize,
    learning_rate: f64,
}

impl SerialOptimizer {
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
        let edges = optimizer_edges(graph, options.epochs)?;
        let head = edges.heads();
        let epochs_per_sample = make_epochs_per_sample(&edges.weights, options.epochs)?;
        let negative_sample_rate = options.negative_sample_rate as f64;
        let epochs_per_negative_sample = epochs_per_sample
            .iter()
            .map(|epochs| epochs / negative_sample_rate)
            .collect::<Vec<_>>();
        let epoch_of_next_sample = epochs_per_sample.clone();
        let epoch_of_next_negative_sample = epochs_per_negative_sample.clone();
        let random_states = per_vertex_random_states(&coordinates, random_state);

        Ok(Self {
            coordinates,
            head,
            tail: edges.tails,
            epochs_per_sample,
            epochs_per_negative_sample,
            epoch_of_next_sample,
            epoch_of_next_negative_sample,
            random_states,
            #[cfg(test)]
            random_calls: vec![0; graph.rows()],
            curve,
            options,
            epoch: 0,
            learning_rate: options.initial_learning_rate,
        })
    }

    /// The current layout, one `[x, y]` pair per graph row.
    pub(crate) fn coordinates(&self) -> &[[f32; 2]] {
        &self.coordinates
    }

    /// The number of completed epochs.
    pub(crate) const fn epoch(&self) -> usize {
        self.epoch
    }

    /// Runs one optimization epoch.
    ///
    /// Returns `Ok(false)` once the epoch budget is exhausted; further calls
    /// keep returning `Ok(false)` without touching the layout.
    #[expect(
        clippy::cast_precision_loss,
        clippy::cast_possible_truncation,
        reason = "the serial reference intentionally matches umap-learn's f64 schedules and f32 \
                  coordinates"
    )]
    pub(crate) fn step(&mut self) -> Result<bool, UmapError> {
        if self.epoch >= self.options.epochs {
            return Ok(false);
        }

        let epoch = self.epoch as f64;
        for edge in 0..self.epochs_per_sample.len() {
            if self.epoch_of_next_sample[edge] > epoch {
                continue;
            }

            let head = self.head[edge] as usize;
            let tail = self.tail[edge] as usize;
            {
                let (current, other) = pair_mut(&mut self.coordinates, head, tail);
                let distance_squared = squared_distance(*current, *other);
                let gradient_coefficient =
                    attractive_gradient_coefficient(distance_squared, self.curve);
                for axis in 0..2 {
                    let difference = f64::from(current[axis] - other[axis]);
                    let gradient = clip(gradient_coefficient * difference);
                    current[axis] =
                        (f64::from(current[axis]) + gradient * self.learning_rate) as f32;
                    other[axis] = (f64::from(other[axis]) - gradient * self.learning_rate) as f32;
                }
            }

            self.epoch_of_next_sample[edge] += self.epochs_per_sample[edge];
            let negative_samples = ((epoch - self.epoch_of_next_negative_sample[edge])
                / self.epochs_per_negative_sample[edge]) as i64;

            for _ in 0..negative_samples.max(0) {
                let random = tau_rand_int(&mut self.random_states[head]);
                #[cfg(test)]
                {
                    self.random_calls[head] += 1;
                }
                let vertex =
                    i64::from(random).rem_euclid(i64::from(self.coordinates.len() as u32)) as u32;
                let vertex = vertex as usize;
                if vertex == head {
                    continue;
                }

                let other = self.coordinates[vertex];
                let current = &mut self.coordinates[head];
                let distance_squared = squared_distance(*current, other);
                let gradient_coefficient = repulsive_gradient_coefficient(
                    distance_squared,
                    self.curve,
                    self.options.repulsion_strength,
                );
                for axis in 0..2 {
                    let difference = f64::from(current[axis] - other[axis]);
                    let gradient = repulsive_gradient(gradient_coefficient, difference);
                    current[axis] =
                        (f64::from(current[axis]) + gradient * self.learning_rate) as f32;
                }
            }

            self.epoch_of_next_negative_sample[edge] +=
                negative_samples as f64 * self.epochs_per_negative_sample[edge];
        }

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

/// Oracle-state accessors for the conformance tests.
#[cfg(test)]
impl SerialOptimizer {
    pub(super) fn epochs_per_sample(&self) -> &[f64] {
        &self.epochs_per_sample
    }

    pub(super) fn epochs_per_negative_sample(&self) -> &[f64] {
        &self.epochs_per_negative_sample
    }

    pub(super) fn random_states(&self) -> &[[i64; 3]] {
        &self.random_states
    }

    pub(super) fn random_calls(&self) -> &[u32] {
        &self.random_calls
    }

    pub(super) const fn curve(&self) -> CurveParameters {
        self.curve
    }
}

/// Borrows two distinct coordinate rows mutably at once.
///
/// # Panics
///
/// Panics in debug builds when `left == right` and in all builds when either
/// index is out of bounds.
fn pair_mut(
    coordinates: &mut [[f32; 2]],
    left: usize,
    right: usize,
) -> (&mut [f32; 2], &mut [f32; 2]) {
    debug_assert_ne!(left, right);
    if left < right {
        let (before, after) = coordinates.split_at_mut(right);
        (&mut before[left], &mut after[0])
    } else {
        let (before, after) = coordinates.split_at_mut(left);
        (&mut after[0], &mut before[right])
    }
}
