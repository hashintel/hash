//! Semantic-graph layout by UMAP's negative-sampling update rule.
//!
//! [`layout_landmarks`] places one 2D point per graph row using [`AffinityCurve`]'s clipped and
//! regularized pair kernels. Attraction moves both endpoints. Negative sampling moves only the
//! anchor, leaving the sampled vertex unchanged. Fuzzy edge weights determine sampling frequency
//! rather than calibrated low-dimensional similarity targets. In general these updates neither
//! descend one scalar objective for the whole graph nor guarantee recovery of its neighbourhoods.
//!
//! # Schedule
//!
//! For a stored edge of weight w > 0, let P = wₘₐₓ / w be its period. It is first due at P and
//! subsequently advances by P on each visit. With E epochs numbered 0 through E − 1, periods
//! greater than E − 1 drop out before optimization. The strongest edges have P = 1 and apply once
//! per epoch after epoch zero. An epoch budget of one returns the initialization even when the
//! graph has edges.
//!
//! Each due directed edge draws r = [`negative_sample_rate`](LayoutOptions::negative_sample_rate)
//! vertices uniformly with replacement. If dᵢ(e) scheduled edges have anchor i in epoch e and the
//! graph has N vertices, the expected number of draws from i to any fixed j is r · dᵢ(e) / N.
//! Different anchor frequencies can produce unequal opposite repulsive updates. This is the
//! sampling model, not a symmetric cross-entropy gradient. Every draw remains in the schedule,
//! including self draws, whose coincident-pair gradient is zero.
//!
//! The learning rate is η(e) = η₀ · (1 − e / E). In real arithmetic the final epoch uses η₀ / E.
//! Periods, due times and learning rates use `f32`, with rounded division and repeated period
//! additions. Large epoch counts can lose integer precision and alter that ideal schedule.
//!
//! Due edges apply in [`Vec2x4T`] batches of four. Their gradients use the batch's entry
//! coordinates, and updates for shared vertices accumulate. Negative draws likewise apply in chunks
//! of four against one anchor position, followed by a scalar remainder. Changing this batch
//! structure changes the numerical method.
//!
//! # Initialization and reproducibility
//!
//! Vertex i starts at angle 2π · i / N with radius 5 · (1 + 0.01 · Uᵢ).
//!
//! Uᵢ is uniform in `[0, 1)` before floating-point rounding. The base diameter is ten, placing the
//! per-axis [gradient clip](AffinityCurve::GRADIENT_CLIP) of four at 0.40 of that base span before
//! learning-rate scaling. Rows with no scheduled edge keep their initial placement because negative
//! sampling never moves its target.
//!
//! Serial batch order fixes which coordinates each update reads. Equal graphs, curves, options and
//! random streams repeat the layout with the same floating-point behavior. Different targets or
//! kernels can change rounded results. The schedule and clipping provide no general convergence
//! guarantee.

use core::{
    array, error::Error, f32::consts::TAU, fmt, iter::Step, num::NonZero, simd::num::SimdFloat as _,
};

use hashql_core::id::{Id, IdSlice, IdVec};
use rand::{Rng, RngExt as _};

use crate::{
    math::{AffinityCurve, NonNegative, Positive, Rotation, Vec2, Vec2x4T, non_negative, positive},
    random::uniform_below,
    salt::semantic::SemanticGraphView,
};

// The defaults are the UMAP reference defaults, carried as unvalidated starting points. The
// release evaluation's layout criteria (trustworthiness, landmark rank correlation) revise them
// from evidence.
/// The default epoch budget.
const DEFAULT_EPOCHS: NonZero<u32> = const { NonZero::new(500).unwrap() };
/// The default learning rate at epoch zero.
const DEFAULT_INITIAL_LEARNING_RATE: Positive = positive!(1.0);
/// The default weight of repulsive updates.
const DEFAULT_REPULSION_STRENGTH: NonNegative = non_negative!(1.0);
/// The default number of vertices repelled per sampled edge.
const DEFAULT_NEGATIVE_SAMPLE_RATE: NonZero<u32> = const { NonZero::new(5).unwrap() };

/// Epoch, learning-rate and negative-sampling settings for one layout.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct LayoutOptions {
    /// Optimization epochs, 500 by default.
    pub epochs: NonZero<u32> = DEFAULT_EPOCHS,
    /// Initial learning rate, 1.0 by default, decaying across the epoch budget.
    pub initial_learning_rate: Positive = DEFAULT_INITIAL_LEARNING_RATE,
    /// Weight of repulsive updates, 1.0 by default. Zero disables repulsion.
    pub repulsion_strength: NonNegative = DEFAULT_REPULSION_STRENGTH,
    /// Uniform vertex draws per sampled edge, 5 by default.
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
    /// The index of one directed edge in the layout's edge schedule.
    #[id(derive(Step), const)]
    struct LandmarkEdgeId(u32)
}

/// Lays out one point per graph row, in row order.
///
/// `graph` supplies the weighted attraction structure, and `curve` supplies the low-dimensional
/// kernels ([`AffinityCurve::fit`]). `rng` drives initialization and negative draws. The schedule
/// uses the graph's stored edge order.
///
/// # Panics
///
/// This panics when the retained schedule exceeds its `u32` edge-id domain or a raw CSR pointer
/// lies outside the graph's stored entries.
///
/// # Errors
///
/// Returns an error when the graph stores no edges.
#[tracing::instrument(skip_all)]
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
/// The base diameter of ten gives a per-axis [`GRADIENT_CLIP`](AffinityCurve::GRADIENT_CLIP) ratio
/// of 4/10 = 0.40 before jitter and learning-rate scaling.
// the radius is an unvalidated starting point. Assess changes together with the clip-to-span ratio
// using trustworthiness and landmark rank correlation.
const INITIAL_RADIUS: f32 = 5.0;
/// Relative radial jitter of the initial circle, breaking the regular polygon's symmetry.
// one-percent radial variation breaks exact regular-polygon symmetry before rounding. Assess its
// scale through the layout quality measurements.
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
    /// Returns [`None`] only when the graph stores no edges. A nonempty graph can yield an empty
    /// schedule if no edge is due within the budget.
    ///
    /// # Panics
    ///
    /// This panics when a raw CSR pointer lies outside the stored entries or the retained edge
    /// count exceeds `E`'s id domain.
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
    /// Edges sharing a vertex within one batch see the batch's entry coordinates. Their updates
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
    /// remainder. Every draw remains in the schedule, including a draw of the anchor itself, whose
    /// coincident-pair gradient is zero.
    fn repel(&mut self, anchor: N, learning_rate: f32) {
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
    fn draw_target(&mut self) -> Vec2 {
        self.coordinates[N::from_u64(uniform_below(&mut self.rng, self.vertices))]
    }
}
