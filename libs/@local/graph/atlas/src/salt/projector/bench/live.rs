//! A live-shape training step, phase by phase, for wall-time measurement.
//!
//! The backend question - would a burn backend over the crate's own kernels beat `NdArray` - prices
//! out through one decomposition: of a real training step at the ratified batch plan, how much is
//! burn tensor work (forward, surrogate, backward, optimizer), how much is the crate's hand-rolled
//! field evaluation, and how much is the CPU batch pipeline (draw, assemble, input
//! materialization). The same decomposition prices the batch pipeline's allocator arena and any
//! per-phase optimization argument, and one fixture therefore feeds three decisions.
//!
//! [`Fixture::build`] synthesizes a corpus at the trainer's shape: a symmetric semantic graph,
//! typed relation instances over sixteen relations, unit-norm representations, local scales, a
//! landmark pool, and a mined frame produced by the real miner over a synthetic coordinate frame.
//! Draws run the production [`BatchSampler`] at the ratified [`BatchPlan`] with every family
//! populated (relation at the lens's active extreme). A measured step therefore carries the full
//! composite objective, not a placeholder loss.
//!
//! Values are synthetic and costs are real. Every phase runs the production code path with the
//! production types, and the numbers mean shape and traversal, never convergence.

use burn::{
    backend::Autodiff,
    module::AutodiffModule as _,
    optim::{AdamConfig, GradientsParams, Optimizer as _},
    prelude::Backend,
};
use hashql_core::id::{Id as _, IdSlice, IdVec};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;

use super::ARCHITECTURE;
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    device::{Inference, PinnedDevice},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{
        AffinityCurve, FinitePointField, MatrixN, NonNegative, UnitFraction, Vec2, non_negative,
        positive,
    },
    salt::{
        policy::ClassProbabilities,
        projector::{
            loss::{AffinityEnergy, CoincidentEnergy, ProximalEnergy, RelationEnergy},
            miner::{HardNegativeMiner, MinedFrame, SpatialField},
            model::{NodeRole, Projector},
            scale::LocalScales,
            train::{
                BatchPlan, ObjectiveOptions, STEPS,
                batch::{
                    Batch, BatchSampler, DrawContext, NodeColumns, Populations, SupportAnchor,
                },
                metrics::{BudgetBreakdown, DegreeDeciles},
                step::Evaluation,
            },
        },
        relation::{
            Policies, RelationConfidence, RelationIndexes, RelationInstance, RelationPolicy,
            attraction::AttractionOptions, protection::ProtectionConfig,
        },
        semantic::{SemanticGraph, SemanticMatrix},
    },
};

/// The relation-type count of the synthetic corpus.
///
/// Comfortably above the ratified per-step draw of twelve, which keeps type selection a real
/// draw.
const RELATION_TYPES: usize = 16;

/// The landmark pool size the ratified draw of 512 samples from.
const LANDMARK_POOL: usize = 4096;

/// One synthesized corpus at the trainer's live shape.
pub struct Fixture {
    /// The corpus row count.
    rows: usize,
    /// The symmetric semantic graph.
    graph: SemanticGraph<NodeRowId>,
    /// The attraction and protection indexes over the synthetic relation instances.
    indexes: RelationIndexes<NodeRowId, EdgeRowId>,
    /// The unit-norm representations, one row per corpus row.
    representations: MatrixN<PROJECTOR_DIMENSIONS>,
    /// The cycling node roles, one per corpus row.
    roles: Vec<NodeRole>,
    /// The synthetic local scales, one per corpus row.
    scales: LocalScales<NodeRowId>,
    /// The landmark anchor pool.
    landmarks: Vec<SupportAnchor<NodeRowId>>,
    /// The mined hard negatives over a synthetic coordinate frame.
    mined: MinedFrame<NodeRowId>,
    /// The ratified batch plan the draws run at.
    plan: BatchPlan,
}

/// One drawn step's populations, opaque to the bench target.
pub struct Drawn<'fixture>(Populations<'fixture, NodeRowId, EdgeRowId>);

/// One assembled batch, opaque to the bench target.
pub struct Assembled(Batch<NodeRowId>);

impl Assembled {
    /// Returns the batch's participating row count.
    #[must_use]
    pub fn rows(&self) -> usize {
        self.0.rows.len()
    }
}

/// The production sampler bound over the fixture, opaque to the bench target.
pub struct Sampler<'fixture> {
    /// The production sampler over the fixture's graph and indexes.
    sampler: BatchSampler<'fixture, NodeRowId, EdgeRowId>,
    /// The fixture the draws read their mined frame and landmarks from.
    fixture: &'fixture Fixture,
}

impl Fixture {
    /// Synthesizes a corpus of `rows` at the ratified batch plan.
    ///
    /// # Panics
    ///
    /// This panics when `rows` is too small to carry the synthetic topology (fewer than 64 rows).
    /// The fixture exists for live-scale measurement, not smoke sizes.
    #[must_use]
    pub fn build(rows: usize, seed: u64) -> Self {
        assert!(rows >= 64, "the live fixture starts at 64 rows");
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);

        let graph = semantic_graph(rows, &mut rng);
        let indexes = relation_indexes(rows);
        let (representations, roles) = columns(rows, &mut rng);
        let scales = LocalScales::new(
            (0..rows)
                .map(|row| {
                    NonNegative::new(scale_of(row))
                        .expect("the synthetic scales are positive and finite")
                })
                .collect::<IdVec<NodeRowId, _>>()
                .into_boxed_slice(),
        );
        let landmarks = landmark_pool(rows, &mut rng);
        let plan = crate::salt::fit::ProjectorOptions::live().plan;

        // The mined frame comes from the production miner over a synthetic
        // coordinate frame: pooled hard negatives at the real quota. The
        // hard family therefore draws and evaluates at its live shape.
        let coordinates: Vec<Vec2> = core::iter::repeat_with(|| {
            Vec2::new(
                rng.random_range(-1.0..=1.0_f32),
                rng.random_range(-1.0..=1.0_f32),
            )
        })
        .take(rows)
        .collect();
        let field = SpatialField::new(
            FinitePointField::new(IdSlice::from_raw(&coordinates))
                .expect("the synthetic frame is finite"),
        );
        let mined = HardNegativeMiner::new(
            graph.view(),
            indexes.protection.view(),
            ProtectionConfig::default(),
            crate::salt::fit::ProjectorOptions::live().miner,
        )
        .mine(&field);

        Self {
            rows,
            graph,
            indexes,
            representations,
            roles,
            scales,
            landmarks,
            mined,
            plan,
        }
    }

    /// Returns the corpus row count.
    #[must_use]
    pub const fn rows(&self) -> usize {
        self.rows
    }

    /// Binds the production sampler over the fixture's artifacts.
    ///
    /// Sampler construction builds cumulative weight tables once per run rather than once per step.
    /// Benches bind the sampler outside the timed region.
    ///
    /// # Panics
    ///
    /// This panics when the semantic graph carries no edge weight. The synthetic graph always has
    /// some.
    #[must_use]
    pub fn sampler(&self) -> Sampler<'_> {
        Sampler {
            sampler: BatchSampler::new(
                self.graph.view(),
                self.indexes.protection.view(),
                ProtectionConfig::default(),
                &self.indexes.attraction,
                self.plan,
            )
            .expect("the synthetic graph carries weight"),
            fixture: self,
        }
    }

    /// Assembles a drawn step into the batch-local domain.
    #[must_use]
    pub fn assemble(&self, drawn: Drawn<'_>) -> Assembled {
        Assembled(Batch::assemble(drawn.0, Some(&self.scales)))
    }
}

impl Sampler<'_> {
    /// Draws one step's populations at the lens's active extreme.
    ///
    /// Every family participates: semantic, ordinary, mined hard negatives, relation edges, and
    /// landmark anchors, at the ratified plan.
    #[must_use]
    pub fn draw(&self, seed: u64) -> Drawn<'_> {
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);
        Drawn(self.sampler.draw(
            DrawContext {
                eta: STEPS[STEPS.len() - 1],
                mined: Some(&self.fixture.mined),
                landmarks: &self.fixture.landmarks,
                anchors: &[],
                target: false,
            },
            &mut rng,
        ))
    }
}

/// The per-backend training state.
struct Live<B: Backend<FloatElem = f32>> {
    /// The training-decorated model, taken out for the optimizer step and put back.
    model: Option<Projector<Autodiff<B>>>,
    /// The Adam optimizer over the model's parameters.
    optimizer: burn::optim::adaptor::OptimizerAdaptor<
        burn::optim::Adam,
        Projector<Autodiff<B>>,
        Autodiff<B>,
    >,
    /// The device every tensor phase runs on.
    device: B::Device,
}

impl<B: Backend<FloatElem = f32>> Live<B> {
    /// Builds the seeded model and a fresh Adam optimizer on `device`.
    fn build(device: B::Device, seed: u64) -> Self {
        Self {
            model: Some(Projector::new(
                ARCHITECTURE,
                &device,
                Xoshiro256PlusPlus::seed_from_u64(seed),
            )),
            optimizer: AdamConfig::new().with_epsilon(1.0e-8).init(),
            device,
        }
    }

    /// Materializes the batch's model input on the device and waits for the queue to drain.
    ///
    /// # Panics
    ///
    /// Panics when the device fails to complete its queue.
    fn input(&self, batch: &Assembled, evaluation: &Evaluation<'_, NodeRowId>) {
        let input = batch
            .0
            .input::<Autodiff<B>>(evaluation.columns, &self.device);
        drop(input);
        B::sync(&self.device).expect("the measured device should complete its queue");
    }

    /// Runs the training-path forward and reads back the output sum, dropping the recorded graph.
    fn forward(&self, batch: &Assembled, evaluation: &Evaluation<'_, NodeRowId>) -> f32 {
        let model = self.model.as_ref().expect("the model is always present");
        let input = batch
            .0
            .input::<Autodiff<B>>(evaluation.columns, &self.device);
        model.forward(input).sum().into_scalar()
    }

    /// Runs the plain-backend forward of the validation model and reads back the output sum.
    fn refresh(&self, batch: &Assembled, evaluation: &Evaluation<'_, NodeRowId>) -> f32 {
        let model = self
            .model
            .as_ref()
            .expect("the model is always present")
            .valid();
        let input = batch.0.input::<B>(evaluation.columns, &self.device);
        model.forward(input).sum().into_scalar()
    }

    /// Evaluates the full composite objective and returns its loss total.
    ///
    /// The return waits for the device queue.
    ///
    /// # Panics
    ///
    /// Panics when the objective leaves the finite domain or the device fails to complete its
    /// queue.
    fn objective(&self, batch: &Assembled, evaluation: &Evaluation<'_, NodeRowId>) -> f32 {
        let model = self.model.as_ref().expect("the model is always present");
        let mut metrics = BudgetBreakdown::default();
        let objective = evaluation
            .objective(model, &batch.0, &mut metrics, &self.device)
            .expect("the synthetic step stays finite");
        let total = objective.loss.total();
        drop(objective);
        B::sync(&self.device).expect("the measured device should complete its queue");
        total
    }

    /// Runs one training step and returns the loss total.
    ///
    /// The step is objective, backward and optimizer, and the return waits for the device queue.
    ///
    /// # Panics
    ///
    /// Panics when the objective leaves the finite domain or the device fails to complete its
    /// queue.
    fn step(&mut self, batch: &Assembled, evaluation: &Evaluation<'_, NodeRowId>) -> f32 {
        let model = self.model.take().expect("the model is always present");
        let mut metrics = BudgetBreakdown::default();
        let objective = evaluation
            .objective(&model, &batch.0, &mut metrics, &self.device)
            .expect("the synthetic step stays finite");
        let total = objective.loss.total();
        let gradients = GradientsParams::from_grads(objective.surrogate.backward(), &model);
        self.model = Some(self.optimizer.step(1.0e-3, model, gradients));
        B::sync(&self.device).expect("the measured device should complete its queue");
        total
    }
}

/// One backend's live stepper.
///
/// The stepper owns the training-decorated model, its optimizer, and the evaluation context. That
/// context - columns, numerical contract, decile axis - binds once at build, as the session binds
/// it once per run. The timed phases never pay setup.
pub struct Stepper<'fixture> {
    /// The model, optimizer, and device.
    live: Live<Inference>,
    /// The evaluation context bound once at build.
    evaluation: Evaluation<'fixture, NodeRowId>,
}

impl<'fixture> Stepper<'fixture> {
    /// Builds the live stepper on the chosen backend.
    #[must_use]
    pub fn build(fixture: &'fixture Fixture, device: PinnedDevice, seed: u64) -> Self {
        let device = device.resolve();
        let live = Live::build(device, seed);

        Self {
            live,
            evaluation: Evaluation {
                columns: NodeColumns {
                    representations: IdSlice::from_raw(fixture.representations.rows()),
                    roles: IdSlice::from_raw(&fixture.roles),
                },
                options: objective_options(),
                deciles: DegreeDeciles::new(&fixture.indexes.attraction, fixture.rows),
            },
        }
    }

    /// Materializes the batch's model input on the device, then waits for the device queue.
    pub fn input(&self, batch: &Assembled) {
        self.live.input(batch, &self.evaluation);
    }

    /// Runs the training-path forward with the autodiff graph recorded.
    ///
    /// A scalar readback synchronizes it.
    ///
    /// This drops the recorded graph without running backward.
    ///
    /// # Advice
    ///
    /// Use this decomposition phase only on the CPU backend. For production-style refresh, use
    /// [`refresh`](Self::refresh), which runs the validation model on the plain backend.
    #[must_use]
    pub fn forward(&self, batch: &Assembled) -> f32 {
        self.live.forward(batch, &self.evaluation)
    }

    /// Runs the refresh forward on the plain backend, synchronized by a scalar readback.
    ///
    /// This runs the validation model without recording an autodiff graph, as production refresh
    /// does.
    #[must_use]
    pub fn refresh(&self, batch: &Assembled) -> f32 {
        self.live.refresh(batch, &self.evaluation)
    }

    /// Runs input, forward, and the full composite objective, returning the loss total.
    ///
    /// This is everything a step does before its backward pass. It covers the readback, the
    /// hand-rolled field evaluation, the budget measurement, the surrogate construction, and the
    /// support terms.
    #[must_use]
    pub fn objective(&self, batch: &Assembled) -> f32 {
        self.live.objective(batch, &self.evaluation)
    }

    /// Runs one full training step (objective, backward, optimizer) and returns the loss total.
    #[must_use]
    pub fn step(&mut self, batch: &Assembled) -> f32 {
        self.live.step(batch, &self.evaluation)
    }
}

/// The ratified numerical contract with the relation energy frozen.
///
/// The constants stay cost-neutral. They steer values and never operation counts. The relation
/// energy is present, as in the ladder regime the ratified schedule spends most steps in.
fn objective_options() -> ObjectiveOptions {
    let ratified = crate::salt::fit::ProjectorOptions::live();
    ObjectiveOptions {
        affinity: AffinityEnergy::new(
            AffinityCurve::new(positive!(1.0), positive!(1.0)),
            ratified.affinity_offset,
        )
        .expect("the curve exponent satisfies the objective bound"),
        relation: Some(
            RelationEnergy::new(
                CoincidentEnergy {
                    radius: non_negative!(0.05),
                    threshold: positive!(1.0),
                },
                ProximalEnergy {
                    radius: non_negative!(0.1),
                    temperature: positive!(0.25),
                },
                positive!(1.0e-3),
            )
            .expect("the radii are ordered"),
        ),
        support: ratified.support,
        budget: ratified.budget,
        coefficients: ratified.coefficients,
    }
}

/// Builds a symmetric semantic graph of about six edges per row.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "the synthetic topology cycles by row position"
)]
fn semantic_graph(rows: usize, rng: &mut Xoshiro256PlusPlus) -> SemanticGraph<NodeRowId> {
    let mut adjacency: Vec<Vec<(usize, f32)>> = vec![Vec::new(); rows];
    for row in 0..rows {
        for stride in [1_usize, 7, 31] {
            let partner = (row + stride) % rows;
            let weight = rng.random_range(0.05..=1.0_f32);
            adjacency[row].push((partner, weight));
            adjacency[partner].push((row, weight));
        }
    }

    let mut indptr = vec![0_u64];
    let mut columns = Vec::new();
    let mut weights = Vec::new();
    for row in &mut adjacency {
        row.sort_unstable_by_key(|&(column, _)| column);
        row.dedup_by_key(|&mut (column, _)| column);
        for &(column, weight) in row.iter() {
            columns.push(u32::try_from(column).expect("synthetic columns fit u32"));
            weights.push(weight);
        }
        indptr.push(u64::try_from(columns.len()).expect("synthetic entries fit u64"));
    }
    let matrix = SemanticMatrix::try_new((rows, rows), indptr, columns, weights)
        .map_err(|(_, _, _, error)| error)
        .expect("the synthetic matrix is structurally valid");
    SemanticGraph::new(matrix).expect("the synthetic graph is a valid semantic graph")
}

/// Builds relation indexes: sixteen full-Proximal types, one instance per row.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "the synthetic topology cycles by row position"
)]
fn relation_indexes(rows: usize) -> RelationIndexes<NodeRowId, EdgeRowId> {
    let policies: Vec<RelationPolicy> = (0..RELATION_TYPES)
        .map(|relation| RelationPolicy {
            relation: OntologyRowId::new(100 + relation as u64),
            attraction: ClassProbabilities {
                coincident: UnitFraction::ZERO,
                proximal: UnitFraction::ONE,
            },
            selected: ClassProbabilities {
                coincident: UnitFraction::ZERO,
                proximal: UnitFraction::ONE,
            },
            applicability: UnitFraction::ONE,
            strength: NonNegative::ONE,
            _pad: [0; 4],
        })
        .collect();

    let mut instances: Vec<RelationInstance<NodeRowId, EdgeRowId>> = (0..rows)
        .map(|index| {
            let source = index;
            let mut target = (index * 7 + 3) % rows;
            if target == source {
                target = (target + 1) % rows;
            }
            RelationInstance {
                edge: EdgeRowId::from_usize(index),
                relation: OntologyRowId::new(100 + (index % RELATION_TYPES) as u64),
                source: NodeRowId::from_usize(source),
                target: NodeRowId::from_usize(target),
                confidence: RelationConfidence::default(),
                multiplicity: 1,
            }
        })
        .collect();

    RelationIndexes::build(
        rows,
        Policies::new(&policies).expect("the synthetic policies are certified"),
        &mut instances,
        AttractionOptions::default(),
    )
    .expect("the synthetic instances satisfy the input contract")
}

/// Synthesizes unit-norm representations and cycling roles.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "the role column cycles by row position"
)]
fn columns(
    rows: usize,
    rng: &mut Xoshiro256PlusPlus,
) -> (MatrixN<PROJECTOR_DIMENSIONS>, Vec<NodeRole>) {
    let mut representations = MatrixN::zeroed(rows);
    for row in representations.rows_mut() {
        let components = row.as_array_mut();
        let mut norm_squared = 0.0_f32;
        for component in components.iter_mut() {
            *component = rng.random_range(-1.0_f32..=1.0);
            norm_squared = component.mul_add(*component, norm_squared);
        }
        let scale = norm_squared.sqrt().recip();
        for component in components.iter_mut() {
            *component *= scale;
        }
    }
    let roles = (0..rows)
        .map(|row| match row % NodeRole::COUNT {
            0 => NodeRole::KnowledgeEntity,
            1 => NodeRole::OntologyType,
            _ => NodeRole::Other,
        })
        .collect();
    (representations, roles)
}

/// Synthesizes the landmark anchor pool.
fn landmark_pool(rows: usize, rng: &mut Xoshiro256PlusPlus) -> Vec<SupportAnchor<NodeRowId>> {
    core::iter::repeat_with(|| SupportAnchor {
        row: NodeRowId::new(rng.random_range(0..rows as u64)),
        target: Vec2::new(
            rng.random_range(-1.0..=1.0_f32),
            rng.random_range(-1.0..=1.0_f32),
        ),
        radius: non_negative!(0.1),
        weight: positive!(1.0),
    })
    .take(LANDMARK_POOL)
    .collect()
}

/// Returns a positive, finite synthetic local scale for `row`.
#[expect(
    clippy::integer_division_remainder_used,
    clippy::cast_precision_loss,
    reason = "the scale pattern cycles by row position over tiny exact integers"
)]
const fn scale_of(row: usize) -> f32 {
    ((row % 97) as f32).mul_add(1.0e-3, 0.05)
}
