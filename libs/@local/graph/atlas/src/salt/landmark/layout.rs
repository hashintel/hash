//! Semantic-graph layout by UMAP's negative-sampling update rule.
//!
//! [`layout_landmarks`] places one 2D point per graph row. Sampled edges pull their endpoints
//! together and uniformly drawn vertices push the sampled endpoint away, each step the gradient of
//! its own pair energy under the [`AffinityCurve`]. The expected update is a field with no scalar
//! objective behind it (negatives move the anchor only); its expected per-pair repulsion is vertex
//! degree times the negative rate over the vertex count, so the layout reproduces the graph's
//! near-binary neighbourhood structure (the scaffold the skeleton stages consume) and the fuzzy
//! weights act through the edge schedule rather than as calibrated similarity targets.
//!
//! Sampling follows the edge weights. An edge is first due one full period of `maximum_weight /
//! weight` epochs in, so the strongest edge applies every epoch after the first and weaker edges
//! proportionally less often. An edge never due within the epoch budget drops out up front. Every
//! sampled edge additionally repels [`negative_sample_rate`](LayoutOptions::negative_sample_rate)
//! uniformly drawn vertices, and the learning rate decays linearly toward zero across the epoch
//! budget (the final epoch steps at `initial / epochs`).
//!
//! Due edges apply in [`Vec2x4T`] batches of four. Gradients within one batch evaluate at the
//! batch's entry coordinates, and the four negative-sample gradients of one chunk accumulate
//! against one anchor position, which gives mini-batch semantics rather than strictly sequential
//! updates.
//!
//! Points start on a jittered circle of diameter ten, an extent that puts the per-axis [gradient
//! clip](AffinityCurve::GRADIENT_CLIP) at 0.40 of the initial span. Every draw comes from the
//! caller-seeded generator, so a rerun over an equal graph, curve, options, and seed reproduces the
//! layout exactly. Rows without edges keep their initial placement: no attraction schedules them,
//! and repulsion moves only the sampled endpoint.
//!
//! The optimizer is serial by design: each gradient step reads coordinates the previous step wrote,
//! and the bit-reproducible layout is the property the serial order buys. Parallelism belongs to
//! the stages around it, not inside the epoch loop.

use core::{
    array, error::Error, f32::consts::TAU, fmt, iter::Step, num::NonZero, simd::num::SimdFloat as _,
};

use hashql_core::id::{Id, IdSlice, IdVec};
use rand::{Rng, RngExt as _};

use crate::{
    math::{AffinityCurve, Rotation, Vec2, Vec2x4T},
    random::uniform_below,
    salt::semantic::SemanticGraphView,
};

/// A value offered as a [`LearningRate`] is not finite and strictly positive.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LearningRateError(f32);

impl fmt::Display for LearningRateError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "the value {} is not a finite, strictly positive learning rate",
            self.0
        )
    }
}

impl Error for LearningRateError {}

/// A finite, strictly positive epoch-zero learning rate, valid by construction.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd, serde::Serialize, serde::Deserialize)]
#[serde(try_from = "f32", into = "f32")]
pub(crate) struct LearningRate(f32);

impl LearningRate {
    /// Validates a learning rate.
    ///
    /// Returns [`None`] unless the value is finite and strictly positive.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f32) -> Option<Self> {
        if !(value.is_finite() && value > 0.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Returns the rate.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f32 {
        self.0
    }
}

impl TryFrom<f32> for LearningRate {
    type Error = LearningRateError;

    #[inline]
    fn try_from(value: f32) -> Result<Self, Self::Error> {
        Self::new(value).ok_or(LearningRateError(value))
    }
}

impl From<LearningRate> for f32 {
    #[inline]
    fn from(rate: LearningRate) -> Self {
        rate.get()
    }
}

/// A value offered as a [`RepulsionStrength`] is not finite and non-negative.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RepulsionStrengthError(f32);

impl fmt::Display for RepulsionStrengthError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "the value {} is not a finite, non-negative repulsion weight",
            self.0
        )
    }
}

impl Error for RepulsionStrengthError {}

/// A finite, non-negative repulsion weight, valid by construction.
///
/// Zero disables repulsion.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd, serde::Serialize, serde::Deserialize)]
#[serde(try_from = "f32", into = "f32")]
pub(crate) struct RepulsionStrength(f32);

impl RepulsionStrength {
    /// Validates a repulsion weight.
    ///
    /// Returns [`None`] unless the value is finite and non-negative.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f32) -> Option<Self> {
        if !(value.is_finite() && value >= 0.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Returns the weight.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f32 {
        self.0
    }
}

impl TryFrom<f32> for RepulsionStrength {
    type Error = RepulsionStrengthError;

    #[inline]
    fn try_from(value: f32) -> Result<Self, Self::Error> {
        Self::new(value).ok_or(RepulsionStrengthError(value))
    }
}

impl From<RepulsionStrength> for f32 {
    #[inline]
    fn from(strength: RepulsionStrength) -> Self {
        strength.get()
    }
}

const DEFAULT_EPOCHS: NonZero<u32> = const { NonZero::new(500).unwrap() };
const DEFAULT_INITIAL_LEARNING_RATE: LearningRate = const { LearningRate::new(1.0).unwrap() };
const DEFAULT_REPULSION_STRENGTH: RepulsionStrength =
    const { RepulsionStrength::new(1.0).unwrap() };
const DEFAULT_NEGATIVE_SAMPLE_RATE: NonZero<u32> = const { NonZero::new(5).unwrap() };

/// Schedule settings for one layout, valid by construction.
// The defaults are the UMAP reference defaults, carried as unvalidated
// starting points; the release evaluation's layout criteria
// (trustworthiness, landmark rank correlation) revise them from
// evidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LayoutOptions {
    /// Optimization epochs.
    pub epochs: NonZero<u32> = DEFAULT_EPOCHS,
    /// Learning rate at epoch zero, decaying linearly toward zero across the epoch budget.
    pub initial_learning_rate: LearningRate = DEFAULT_INITIAL_LEARNING_RATE,
    /// Weight of repulsive updates.
    pub repulsion_strength: RepulsionStrength = DEFAULT_REPULSION_STRENGTH,
    /// Vertices repelled per sampled edge.
    pub negative_sample_rate: NonZero<u32> = DEFAULT_NEGATIVE_SAMPLE_RATE,
}

const impl Default for LayoutOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// The graph stores no edges to optimize toward.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct EdgelessGraphError;

impl fmt::Display for EdgelessGraphError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("the semantic graph stores no edges to optimize toward")
    }
}

impl Error for EdgelessGraphError {}

hashql_core::id::newtype! {
    #[id(derive(Step), const)]
    struct LandmarkEdgeId(u32)
}

/// Lays out one point per graph row, in row order.
///
/// `graph` is the attraction structure - for the landmark skeleton, the quotient over the landmark
/// domain, indexed by ordinal - and `curve` the fitted low-dimensional kernel
/// ([`AffinityCurve::fit`]). `rng` drives the initial placement and the negative draws.
///
/// # Errors
///
/// Returns an error when the graph stores no edges.
pub(crate) fn layout_landmarks<N>(
    graph: &SemanticGraphView<'_, N>,
    curve: AffinityCurve,
    options: LayoutOptions,
    mut rng: impl Rng,
) -> Result<Box<IdSlice<N, Vec2>>, EdgelessGraphError>
where
    N: Id,
{
    let schedule = EdgeSchedule::<N, LandmarkEdgeId>::build(graph, options.epochs)
        .ok_or(EdgelessGraphError)?;
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

/// Radius of the initial circle.
///
/// The resulting diameter of ten puts the per-axis [`GRADIENT_CLIP`](AffinityCurve::GRADIENT_CLIP)
/// at 0.40 of the initial extent.
// Pinning the radius and the clip fixes one ratio: how far a single sample can move a point
// relative to the layout's extent. A knob on one side changes that ratio with nothing to signal the
// change. If the frame ever moves, both move together. The clip is the UMAP reference constant,
// whose frame spans twenty (ratio 0.20), and ten carries no recorded derivation, so the 0.40 here
// is an unvalidated starting point that the release evaluation's layout criteria revise from
// evidence.
const INITIAL_RADIUS: f32 = 5.0;
/// Relative radial jitter of the initial circle, breaking the regular polygon's symmetry.
// Pinned, not configurable: any small positive value serves; the only
// distinguishable settings are zero (restores the symmetric saddle)
// and large (distorts the circle for nothing).
const RADIAL_JITTER: f32 = 0.01;

/// Places every vertex on the jittered initial circle, by vertex order.
///
/// The vertex's share of a full turn, applied to a jittered radius vector.
#[expect(
    clippy::cast_precision_loss,
    reason = "vertex ordinals lose angular precision only beyond exact f32 integers, where \
              adjacent initial angles are indistinguishable anyway"
)]
fn initial_coordinates<N>(rows: usize, mut rng: impl Rng) -> IdVec<N, Vec2>
where
    N: Id,
{
    IdVec::from_fn(rows, |vertex: N| {
        let rotation = Rotation::from_radians(TAU * (vertex.as_u64() as f32) / (rows as f32));

        let radius = INITIAL_RADIUS * RADIAL_JITTER.mul_add(rng.random::<f32>(), 1.0);
        rotation.apply(Vec2::new(radius, 0.0))
    })
}

/// Sampled off-diagonal edges and their due schedule, in row order.
struct EdgeSchedule<N, E> {
    heads: IdVec<E, N>,
    tails: IdVec<E, N>,
    /// Epochs between samples of each edge: `maximum / weight`, at least one.
    periods: IdVec<E, f32>,
    /// The epoch at which each edge is next due.
    due: IdVec<E, f32>,
}

impl<N, E> EdgeSchedule<N, E>
where
    N: Id,
    E: Id,
{
    /// Extracts the edges due at least once within the epoch budget.
    ///
    /// Returns [`None`] when the graph stores no edges. Weights are finite in `(0, 1]` by the
    /// graph's invariants, so the schedule re-validates nothing.
    #[expect(
        clippy::cast_precision_loss,
        reason = "the matrix's u32 column index type bounds the square row domain, and epoch \
                  budgets lose schedule precision only beyond exact f32 integers"
    )]
    fn build(graph: &SemanticGraphView<'_, N>, epochs: NonZero<u32>) -> Option<Self> {
        let (indptr, columns, weights) = graph.matrix().into_raw_storage();
        let maximum = weights.iter().copied().reduce(f32::max)?;
        let budget = epochs.get() as f32;

        let mut heads = IdVec::new();
        let mut tails = IdVec::new();
        let mut periods = IdVec::new();
        let position = |pointer: u64| {
            usize::try_from(pointer).expect("a resident graph's entries fit the address space")
        };

        for (row, &[start, end]) in indptr.array_windows::<2>().enumerate() {
            let row = N::from_usize(row);

            for entry in position(start)..position(end) {
                let period = maximum / weights[entry];
                // Deadlines run to one below the budget, and each edge's period fixes the deadline
                // at which it first applies.
                if period > budget - 1.0 {
                    continue;
                }

                heads.push(row);
                tails.push(N::from_u32(columns[entry]));
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
struct Optimizer<N, E, R> {
    coordinates: IdVec<N, Vec2>,
    schedule: EdgeSchedule<N, E>,
    curve: AffinityCurve,
    options: LayoutOptions,
    /// The vertex count, the bound of every negative draw.
    vertices: NonZero<u64>,
    rng: R,
}

impl<N, E, R> Optimizer<N, E, R>
where
    N: Id,
    E: Id,
    R: Rng,
{
    /// Runs the full epoch budget and returns the final coordinates.
    #[expect(
        clippy::cast_precision_loss,
        reason = "epoch budgets lose schedule precision only beyond exact f32 integers"
    )]
    fn run(mut self) -> IdVec<N, Vec2>
    where
        E: Step,
    {
        let epochs = self.options.epochs.get();

        for epoch in 0..epochs {
            let learning_rate =
                self.options.initial_learning_rate.get() * (1.0 - epoch as f32 / epochs as f32);

            self.step(epoch as f32, learning_rate);
        }

        self.coordinates
    }

    /// Applies every edge due by `deadline`, batched four at a time.
    fn step(&mut self, deadline: f32, learning_rate: f32)
    where
        E: Step,
    {
        let mut pending = [E::from_usize(0); 4];
        let mut filled = 0_usize;

        for edge in E::MIN..self.schedule.due.bound() {
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
                self.repel(self.schedule.heads[edge], learning_rate);
            }
            filled = 0;
        }

        for &edge in &pending[..filled] {
            self.attract(edge, learning_rate);
            self.repel(self.schedule.heads[edge], learning_rate);
        }
    }

    /// Applies the symmetric attraction update of four edges.
    ///
    /// Edges sharing a vertex within one batch see the batch's entry coordinates; their updates
    /// accumulate.
    fn attract_x4(&mut self, edges: [E; 4], learning_rate: f32) {
        let heads = edges.map(|edge| self.schedule.heads[edge]);
        let tails = edges.map(|edge| self.schedule.tails[edge]);

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
    fn attract(&mut self, edge: E, learning_rate: f32) {
        let head = self.schedule.heads[edge];
        let tail = self.schedule.tails[edge];

        let gradient = self
            .curve
            .attraction(self.coordinates[head], self.coordinates[tail]);
        let step = gradient * learning_rate;
        self.coordinates[head] += step;
        self.coordinates[tail] -= step;
    }

    /// Repels the anchor from `negative_sample_rate` drawn vertices.
    ///
    /// Draws apply in chunks of four against the anchor's position at chunk entry, with a scalar
    /// remainder. A draw of the anchor itself is a coincident pair and contributes no gradient, so
    /// the loop keeps every draw.
    fn repel(&mut self, anchor: N, learning_rate: f32) {
        let mut remaining = self.options.negative_sample_rate.get();

        while remaining >= 4 {
            let position = Vec2x4T::from([self.coordinates[anchor]; 4]);
            let targets = Vec2x4T::from(array::from_fn(|_| self.draw_target()));

            let gradients =
                self.curve
                    .repulsion_x4(position, targets, self.options.repulsion_strength.get());
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
                self.options.repulsion_strength.get(),
            );

            self.coordinates[anchor] += gradient * learning_rate;
        }
    }

    /// Draws one uniform vertex and returns its coordinates.
    fn draw_target(&mut self) -> Vec2 {
        self.coordinates[N::from_u64(uniform_below(&mut self.rng, self.vertices))]
    }
}
