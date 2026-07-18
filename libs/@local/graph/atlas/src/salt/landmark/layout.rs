//! Stochastic gradient layout over a semantic graph.
//!
//! [`layout_landmarks`] places one 2D point per graph row by descending
//! the UMAP objective: the cross-entropy between the graph's fuzzy
//! weights and the [`AffinityCurve`] over layout distances. Sampled
//! edges pull their endpoints together, and uniformly sampled vertices
//! push the sampled endpoint away.
//!
//! Sampling follows the edge weights: an edge is due every
//! `maximum_weight / weight` epochs, so the strongest edge is sampled
//! every epoch and weaker edges proportionally less often. Edges whose
//! period exceeds the epoch budget would never be due and are dropped
//! up front. Every sampled edge additionally repels
//! [`negative_sample_rate`](LayoutOptions::negative_sample_rate)
//! uniformly drawn vertices, and the learning rate decays linearly to
//! zero across the epoch budget.
//!
//! Due edges apply in [`Vec2x4T`] batches of four: gradients within one
//! batch are evaluated at the batch's entry coordinates and the four
//! negative-sample gradients of one chunk accumulate against one anchor
//! position - mini-batch semantics rather than strictly sequential
//! updates.
//!
//! Points start on a jittered circle of diameter ten, the span the
//! per-axis [gradient clip](AffinityCurve::GRADIENT_CLIP) is designed
//! against. Every draw comes from the caller-seeded generator, so a
//! rerun over an equal graph, curve, options, and seed reproduces the
//! layout exactly. Rows without edges keep their initial placement: no
//! attraction schedules them, and repulsion moves only the sampled
//! endpoint.

use core::{array, error::Error, f32::consts::TAU, fmt, num::NonZero, simd::num::SimdFloat as _};

use rand::{Rng, RngExt as _};

use crate::{
    math::{AffinityCurve, Vec2, Vec2x4T},
    random::uniform_below,
    salt::semantic::SemanticGraphView,
};

/// Schedule settings for one layout.
// The defaults are the UMAP reference defaults, carried as unvalidated
// starting points; the release evaluation's layout gates
// (trustworthiness, landmark rank correlation) revise them from
// evidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LayoutOptions {
    /// Optimization epochs. Defaults to 500.
    pub epochs: NonZero<u32> = const { NonZero::new(500).unwrap() },
    /// Learning rate at epoch zero, finite and strictly positive; it
    /// decays linearly to zero across the epoch budget. Defaults to 1.
    pub initial_learning_rate: f32 = 1.0,
    /// Weight of repulsive updates, finite and non-negative. Defaults
    /// to 1.
    pub repulsion_strength: f32 = 1.0,
    /// Vertices repelled per sampled edge. Defaults to 5.
    pub negative_sample_rate: NonZero<u32> = const { NonZero::new(5).unwrap() },
}

/// The layout inputs are malformed.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum LayoutError {
    /// The graph stores no edges to optimize toward.
    NoEdges,
    /// The initial learning rate is not finite and strictly positive.
    InvalidLearningRate { value: f32 },
    /// The repulsion strength is not finite and non-negative.
    InvalidRepulsionStrength { value: f32 },
}

impl fmt::Display for LayoutError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::NoEdges => fmt.write_str("the semantic graph stores no edges to optimize toward"),
            Self::InvalidLearningRate { value } => write!(
                fmt,
                "the initial learning rate {value} is not finite and strictly positive",
            ),
            Self::InvalidRepulsionStrength { value } => write!(
                fmt,
                "the repulsion strength {value} is not finite and non-negative",
            ),
        }
    }
}

impl Error for LayoutError {}

/// Lays out one point per graph row, in row order.
///
/// `graph` is the attraction structure - for the landmark skeleton, the
/// quotient over the landmark domain, indexed by ordinal - and `curve`
/// the fitted low-dimensional kernel ([`AffinityCurve::fit`]). `rng`
/// drives the initial placement and the negative draws.
///
/// # Errors
///
/// Returns an error when the graph stores no edges, or when the
/// learning rate or repulsion strength is malformed.
pub(crate) fn layout_landmarks(
    graph: &SemanticGraphView<'_>,
    curve: AffinityCurve,
    options: LayoutOptions,
    mut rng: impl Rng,
) -> Result<Box<[Vec2]>, LayoutError> {
    if !options.initial_learning_rate.is_finite() || options.initial_learning_rate <= 0.0 {
        return Err(LayoutError::InvalidLearningRate {
            value: options.initial_learning_rate,
        });
    }

    if !options.repulsion_strength.is_finite() || options.repulsion_strength < 0.0 {
        return Err(LayoutError::InvalidRepulsionStrength {
            value: options.repulsion_strength,
        });
    }

    let schedule = EdgeSchedule::build(graph, options.epochs).ok_or(LayoutError::NoEdges)?;
    let coordinates = initial_coordinates(graph.rows(), &mut rng);
    let vertices =
        NonZero::new(coordinates.len() as u64).expect("a semantic graph holds at least two rows");

    let optimizer = Optimizer {
        coordinates,
        schedule,
        curve,
        options,
        vertices,
        rng,
    };

    Ok(optimizer.run().into_boxed_slice())
}

/// Radius of the initial circle: a diameter of ten matches the span the
/// gradient clip is designed against.
const INITIAL_RADIUS: f32 = 5.0;
/// Relative radial jitter of the initial circle, breaking the regular
/// polygon's symmetry.
const RADIAL_JITTER: f32 = 0.01;

/// Places every vertex on the jittered initial circle, by vertex order.
#[expect(
    clippy::cast_precision_loss,
    reason = "vertex ordinals lose angular precision only beyond exact f32 integers, where \
              adjacent initial angles are indistinguishable anyway"
)]
fn initial_coordinates(rows: usize, mut rng: impl Rng) -> Vec<Vec2> {
    (0..rows)
        .map(|vertex| {
            let angle = TAU * (vertex as f32) / (rows as f32);
            let radius = INITIAL_RADIUS * RADIAL_JITTER.mul_add(rng.random::<f32>(), 1.0);
            Vec2::new(radius * angle.cos(), radius * angle.sin())
        })
        .collect()
}

/// Sampled off-diagonal edges and their due schedule, in row order.
struct EdgeSchedule {
    heads: Vec<u32>,
    tails: Vec<u32>,
    /// Epochs between samples of each edge: `maximum / weight`, at
    /// least one.
    periods: Vec<f32>,
    /// The epoch at which each edge is next due.
    due: Vec<f32>,
}

impl EdgeSchedule {
    /// Extracts the edges due at least once within the epoch budget.
    ///
    /// Returns [`None`] when the graph stores no edges. Weights are
    /// finite in `(0, 1]` by the graph's invariants, so the schedule
    /// re-validates nothing.
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_precision_loss,
        reason = "the matrix's u32 column index type bounds the square row domain, and epoch \
                  budgets lose schedule precision only beyond exact f32 integers"
    )]
    fn build(graph: &SemanticGraphView<'_>, epochs: NonZero<u32>) -> Option<Self> {
        let (indptr, columns, weights) = graph.matrix().into_raw_storage();
        let maximum = weights.iter().copied().reduce(f32::max)?;
        let budget = epochs.get() as f32;

        let mut heads = Vec::new();
        let mut tails = Vec::new();
        let mut periods = Vec::new();
        let position = |pointer: u64| {
            usize::try_from(pointer).expect("a resident graph's entries fit the address space")
        };
        for (row, (&start, &end)) in indptr.iter().zip(&indptr[1..]).enumerate() {
            for entry in position(start)..position(end) {
                let period = maximum / weights[entry];
                if period > budget {
                    continue;
                }

                heads.push(row as u32);
                tails.push(columns[entry]);
                periods.push(period);
            }
        }

        let due = periods.clone();
        Some(Self {
            heads,
            tails,
            periods,
            due,
        })
    }
}

/// The mutable optimization state of one layout run.
struct Optimizer<R> {
    coordinates: Vec<Vec2>,
    schedule: EdgeSchedule,
    curve: AffinityCurve,
    options: LayoutOptions,
    /// The vertex count, the bound of every negative draw.
    vertices: NonZero<u64>,
    rng: R,
}

impl<R: Rng> Optimizer<R> {
    /// Runs the full epoch budget and returns the final coordinates.
    #[expect(
        clippy::cast_precision_loss,
        reason = "epoch budgets lose schedule precision only beyond exact f32 integers"
    )]
    fn run(mut self) -> Vec<Vec2> {
        let epochs = self.options.epochs.get();
        for epoch in 0..epochs {
            let learning_rate =
                self.options.initial_learning_rate * (1.0 - epoch as f32 / epochs as f32);
            self.step(epoch as f32, learning_rate);
        }

        self.coordinates
    }

    /// Applies every edge due by `deadline`, batched four at a time.
    fn step(&mut self, deadline: f32, learning_rate: f32) {
        let mut pending = [0_usize; 4];
        let mut filled = 0_usize;

        for edge in 0..self.schedule.due.len() {
            if self.schedule.due[edge] > deadline {
                continue;
            }

            self.schedule.due[edge] += self.schedule.periods[edge];
            pending[filled] = edge;
            filled += 1;
            if filled < pending.len() {
                continue;
            }

            self.attract_x4(pending, learning_rate);
            for &edge in &pending {
                self.repel(self.schedule.heads[edge] as usize, learning_rate);
            }
            filled = 0;
        }

        for &edge in &pending[..filled] {
            self.attract(edge, learning_rate);
            self.repel(self.schedule.heads[edge] as usize, learning_rate);
        }
    }

    /// Applies the symmetric attraction update of four edges.
    ///
    /// Edges sharing a vertex within one batch see the batch's entry
    /// coordinates; their updates accumulate.
    fn attract_x4(&mut self, edges: [usize; 4], learning_rate: f32) {
        let heads = edges.map(|edge| self.schedule.heads[edge] as usize);
        let tails = edges.map(|edge| self.schedule.tails[edge] as usize);
        let from = Vec2x4T::from(heads.map(|head| self.coordinates[head]));
        let to = Vec2x4T::from(tails.map(|tail| self.coordinates[tail]));

        let gradients = self.curve.attraction_x4(from, to);
        for lane in 0..edges.len() {
            let step = gradients.get(lane) * learning_rate;
            self.coordinates[heads[lane]] += step;
            self.coordinates[tails[lane]] -= step;
        }
    }

    /// Applies the symmetric attraction update of one edge.
    fn attract(&mut self, edge: usize, learning_rate: f32) {
        let head = self.schedule.heads[edge] as usize;
        let tail = self.schedule.tails[edge] as usize;

        let gradient = self
            .curve
            .attraction(self.coordinates[head], self.coordinates[tail]);
        let step = gradient * learning_rate;
        self.coordinates[head] += step;
        self.coordinates[tail] -= step;
    }

    /// Repels the anchor from `negative_sample_rate` drawn vertices.
    ///
    /// Draws apply in chunks of four against the anchor's position at
    /// chunk entry, with a scalar remainder. A draw of the anchor
    /// itself is a coincident pair and contributes no gradient, so no
    /// draw is rejected.
    fn repel(&mut self, anchor: usize, learning_rate: f32) {
        let mut remaining = self.options.negative_sample_rate.get();
        while remaining >= 4 {
            let position = Vec2x4T::from([self.coordinates[anchor]; 4]);
            let targets = Vec2x4T::from(array::from_fn(|_| self.draw_target()));

            let gradients =
                self.curve
                    .repulsion_x4(position, targets, self.options.repulsion_strength);
            let step =
                Vec2::new(gradients.xs().reduce_sum(), gradients.ys().reduce_sum()) * learning_rate;
            self.coordinates[anchor] += step;
            remaining -= 4;
        }

        for _ in 0..remaining {
            let target = self.draw_target();
            let gradient = self.curve.repulsion(
                self.coordinates[anchor],
                target,
                self.options.repulsion_strength,
            );
            self.coordinates[anchor] += gradient * learning_rate;
        }
    }

    /// Draws one uniform vertex and returns its coordinates.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "vertex counts index an in-memory layout, which cannot outgrow the address space"
    )]
    fn draw_target(&mut self) -> Vec2 {
        self.coordinates[uniform_below(&mut self.rng, self.vertices) as usize]
    }
}
