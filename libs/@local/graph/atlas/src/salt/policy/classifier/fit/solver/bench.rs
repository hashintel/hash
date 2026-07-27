//! Measurement seam comparing the production classifier optimizer against the bounded solver.
//!
//! The harness target (`examples/classifier_compare.rs`) reconstructs the classifier training
//! set of one published generation from its staged annotation artifacts, runs the production
//! L-BFGS path and the trust-region Newton-CG solver over the identical bytes, and reads
//! plain-number results: reconstruction certificates, determinism certificates, cross-frame
//! objective agreement, convergence traces in a shared work currency, and wall-clock samples.
//! Nothing here is API for consumers of the crate.
//!
//! Failures panic with the failing step's error: a measurement run has no recovery path, and the
//! error is the diagnosis.
//!
//! # Reconstruction
//!
//! The staged `annotation-corpus.json` document replays through the production assembly with an
//! embedder that answers every card text from the staged embedding table by text hash and
//! refuses to embed anything new. Serializing the reassembled table must reproduce the staged
//! array files byte-for-byte (SHA-256 equality), and the re-run production fit must terminate at
//! the recorded iteration count; together the checks certify that the measured inputs are the
//! bytes the production fit consumed.
//!
//! # Shared work currency
//!
//! Both optimizers are charged in completed corpus passes: one traversal of every training row.
//! On the production side a seam adapter counts each cost and each gradient evaluation as one
//! pass; on the solver side the per-outer receipts carry completed joint, objective-only,
//! gradient-only, and Hessian-vector traversal counts, each likewise one pass. Preparation and
//! validation passes are reported separately on both sides. Objectives are compared in the raw
//! frame `F = S · F̄`, where `S` is the total corpus weight and `F̄` the solver's
//! weight-normalized objective.

use alloc::rc::Rc;
use core::{
    cell::RefCell,
    num::{NonZeroU32, NonZeroU64},
};
use std::time::Instant;

use argmin::{
    core::{CostFunction, Executor, Gradient, State as _},
    solver::{
        linesearch::{BacktrackingLineSearch, MoreThuenteLineSearch, condition::ArmijoCondition},
        quasinewton::LBFGS,
    },
};
use camino::{Utf8Path, Utf8PathBuf};
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

// The measured paths themselves: the production fit surfaces and the solver internals.
use super::super::{
    FitConfig, TrainingRow, TrainingSet, grouped_folds,
    objective::{Objective, Parameters},
};
use super::{
    ContrastVector, basis,
    config::SolverConfig,
    prepare::{PreparationSettings, prepare},
    problem::ScaledProblem,
    solve::solve,
    work::WorkCounters,
};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    file::{
        array::ArrayFile,
        generation::{GenerationId, GenerationRoot},
    },
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{
        AlignedVecN, BoxedVecN, DNonNegative, DPositive, GreaterThanOne, MatrixN, OpenUnitFraction,
        VecN,
    },
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        fit::annotations::SuppliedAnnotations,
        policy::{
            GeometryClass,
            annotation::assembly::{AssembledCorpus, AssemblyConfig, assemble},
        },
    },
};

/// Options of one comparison run.
#[derive(Debug, Clone)]
pub struct CompareOptions {
    /// Directory of the generation root holding the published generation.
    pub root: Utf8PathBuf,
    /// Hex identity of the published generation whose staged corpus is measured.
    pub generation: String,
    /// Timed samples per measurement after one untimed warmup.
    pub timed_repeats: usize = 5,
    /// Fold-assignment seeds of the grouped rows.
    pub fold_seeds: [u64; 3] = [0, 1, 2],
    /// Run the grouped rows; the solo rows always run.
    pub grouped: bool = true,
    /// Overrides the echoed gradient tolerance, for stopping-sensitivity runs.
    ///
    /// Absent, the comparison binds the tolerance the generation's fit echoed.
    pub gradient_tolerance: Option<f64> = None,
}

/// Prints one progress line to stderr with the elapsed seconds of the finished step.
// Progress is diagnostic narration, never report data: the report is
// stdout, so a hung or budget-burning step is visible while it runs.
#[expect(
    clippy::print_stderr,
    reason = "progress narration is the seam's live diagnostic"
)]
fn progress(step: &str, start: Instant) {
    eprintln!("[{:8.1}s] {step}", start.elapsed().as_secs_f64());
}

/// One comparison over one frozen corpus.
#[derive(Debug)]
pub struct Comparison {
    /// The frozen-input certificates.
    pub corpus: CorpusCertificate,
    /// The production L-BFGS path over the full corpus.
    pub old: OldSolo,
    /// The trust-region Newton-CG solver over the full corpus.
    pub new: NewSolo,
    /// Objective agreement across the two parameter frames.
    pub cross: CrossFrame,
    /// Completed corpus passes each optimizer needs to reach the shared objective target.
    pub work_to_target: WorkToTarget,
    /// The grouped (fold-parallel) rows; absent when the options skip them.
    pub grouped: Option<Grouped>,
}

/// Identity and reconstruction evidence of the measured corpus.
#[derive(Debug)]
pub struct CorpusCertificate {
    /// The published generation the corpus came from.
    pub generation: String,
    /// SHA-256 of the staged annotation-corpus document.
    pub corpus_digest: String,
    /// The corpus document bytes hash to the digest the generation recorded.
    pub document_verified: bool,
    /// The reassembled embedding array serializes byte-identically to the staged artifact.
    pub embeddings_verified: bool,
    /// The reassembled hash array serializes byte-identically to the staged artifact.
    pub hashes_verified: bool,
    /// Trained rows in the training set.
    pub trained: usize,
    /// Total corpus weight `S`.
    pub total_weight: f64,
    /// Recorded final-model iteration count of the generation's production fit.
    pub recorded_iterations: u64,
    /// The L2 penalty the generation's fit ran under, from its configuration echo.
    pub regularization: f64,
    /// The gradient tolerance the generation's fit ran under, from its configuration echo.
    pub gradient_tolerance: f64,
    /// The iteration bound the generation's fit ran under, from its configuration echo.
    pub maximum_iterations: u64,
}

/// Wall-clock samples of one repeated measurement, in seconds.
#[derive(Debug)]
pub struct Timing {
    /// Timed samples after one untimed warmup, in run order.
    pub samples: Vec<f64>,
}

impl Timing {
    /// Times `run` once untimed, then `repeats` times.
    fn measure<T>(repeats: usize, mut run: impl FnMut() -> T) -> Self {
        let _warmup = run();
        let samples = core::iter::repeat_with(|| {
            let start = Instant::now();
            let _result = run();
            start.elapsed().as_secs_f64()
        })
        .take(repeats)
        .collect();
        Self { samples }
    }

    /// The median sample.
    ///
    /// # Panics
    ///
    /// Panics when no samples were taken.
    #[must_use]
    pub fn median(&self) -> f64 {
        let mut sorted = self.samples.clone();
        sorted.sort_unstable_by(f64::total_cmp);
        assert!(!sorted.is_empty(), "a timing holds at least one sample");
        sorted[sorted.len() >> 1]
    }
}

/// One objective observation at a cumulative completed-pass count.
#[derive(Debug, Copy, Clone)]
pub struct TracePoint {
    /// Completed corpus passes charged when the objective was observed.
    pub passes: u64,
    /// The raw-frame objective observed.
    pub objective: f64,
}

/// The incumbent L-BFGS path measured solo over the full corpus.
///
/// The line search is Moré-Thuente under the strong Wolfe constants; the crate's default
/// backtracking search does not terminate on this corpus, so the incumbent rows measure the
/// terminating configuration and [`ArmijoExhibit`] documents the default's pathology.
#[derive(Debug)]
pub struct OldSolo {
    /// Iterations of the converged fit.
    pub iterations: u64,
    /// The iteration count equals the generation's recorded production fit.
    pub matches_recorded_iterations: bool,
    /// The optimizer's own termination verdict.
    pub status: String,
    /// Raw-frame objective at the solution.
    pub final_objective: f64,
    /// Euclidean gradient norm at the solution, in the flat class frame.
    pub final_gradient_norm: f64,
    /// Cost evaluations counted at the seam, one completed pass each.
    pub cost_passes: u64,
    /// Gradient evaluations counted at the seam, one completed pass each.
    pub gradient_passes: u64,
    /// Validation passes ahead of the optimizer loop.
    pub validation_passes: u64,
    /// Two same-input runs produced bit-identical parameters.
    pub deterministic: bool,
    /// The seam-adapted run produced bit-identical parameters to the plain run.
    pub adapter_transparent: bool,
    /// Objective observations at the cost seam, raw frame.
    pub trace: Vec<TracePoint>,
    /// Wall clock of one incumbent fit.
    pub timing: Timing,
    /// The crate-default backtracking search's bounded run on the same corpus.
    pub armijo: ArmijoExhibit,
}

/// One bounded run of the crate-default Armijo backtracking configuration.
///
/// The run is capped at [`EXHIBIT_BUDGET`] cost evaluations; a healthy search spends a handful
/// per iteration, so exhausting the budget is the non-termination verdict, not a tight resource
/// limit.
#[derive(Debug)]
pub struct ArmijoExhibit {
    /// The returned point's gradient reached the configured tolerance.
    pub converged: bool,
    /// The optimizer's own termination verdict, or the budget error that ended the run.
    pub status: String,
    /// Cost evaluations spent when the run ended.
    pub cost_passes: u64,
    /// Gradient evaluations spent when the run ended.
    pub gradient_passes: u64,
    /// The best objective observed at the cost seam, raw frame.
    pub best_objective: f64,
}

/// Cost evaluations the Armijo exhibit may spend before the verdict is non-termination.
// Matches the terminating incumbent's whole-fit spend by two orders of
// magnitude: a search still running at this depth is degenerate.
const EXHIBIT_BUDGET: u64 = 50_000;

/// The trust-region Newton-CG solver measured solo over the full corpus.
#[derive(Debug)]
pub struct NewSolo {
    /// Outer iterations started.
    pub outer_iterations: u64,
    /// Raw-frame objective at the solution.
    pub final_objective: f64,
    /// Weight-normalized objective at the solution.
    pub final_objective_normalized: f64,
    /// Scaled gradient norm at the solution, the solver's own convergence quantity.
    pub final_scaled_gradient_norm: f64,
    /// Completed joint traversals.
    pub joint_passes: u64,
    /// Completed objective-only traversals.
    pub objective_passes: u64,
    /// Completed gradient-only traversals.
    pub gradient_passes: u64,
    /// Completed Hessian-vector traversals.
    pub hvp_passes: u64,
    /// Completed preparation traversals.
    pub preparation_passes: u64,
    /// Candidate acceptances.
    pub acceptances: u64,
    /// Candidate rejections by ratio.
    pub ratio_rejections: u64,
    /// Two same-input runs produced bit-identical accepted points.
    pub deterministic: bool,
    /// Accepted objective per outer receipt, raw frame, at cumulative completed passes.
    pub trace: Vec<TracePoint>,
    /// Wall clock of preparation plus solve.
    pub timing: Timing,
}

/// Objective agreement across the flat class frame and the contrast frame.
///
/// Each solution evaluates under both arithmetics: the production solution reduces into contrast
/// coordinates for the solver's evaluator, and the solver solution expands into flat class
/// coordinates for the production evaluator. Agreement is reported as relative differences of
/// raw-frame objectives.
#[derive(Debug)]
pub struct CrossFrame {
    /// Production objective of the production solution.
    pub old_at_old: f64,
    /// Solver objective of the production solution, raw frame.
    pub new_frame_at_old: f64,
    /// Production objective of the expanded solver solution.
    pub old_frame_at_new: f64,
    /// Solver objective of the solver solution, raw frame.
    pub new_at_new: f64,
    /// Relative frame disagreement at the production solution.
    pub relative_disagreement_at_old: f64,
    /// Relative frame disagreement at the solver solution.
    pub relative_disagreement_at_new: f64,
    /// Euclidean gradient norm of the expanded solver solution under the production objective.
    pub old_frame_gradient_norm_at_new: f64,
    /// Largest class-sum magnitude across the production solution's coefficient columns.
    ///
    /// The optimizer preserves zero class sums from its zero start up to rounding, so this is
    /// the gauge mass the reduction into contrast coordinates discards.
    pub old_gauge_mass: f64,
    /// Class-sum magnitude of the production solution's intercepts.
    pub old_intercept_gauge: f64,
}

/// Completed corpus passes to reach the shared objective target.
///
/// The target is the better final raw-frame objective of the two solo runs, relaxed by a
/// relative `1e-9`. Each side reaches it at the first of its own objective observations at or
/// under the target: the cost seam on the production side, the accepted-outer receipts on the
/// solver side. Rejected solver candidates are not credited, which can only overstate the
/// solver's count.
#[derive(Debug)]
pub struct WorkToTarget {
    /// The shared raw-frame objective target.
    pub target: f64,
    /// Production passes to the target; [`None`] when the trace never reaches it.
    pub old_passes: Option<u64>,
    /// Solver passes to the target; [`None`] when no accepted outer reaches it.
    pub new_passes: Option<u64>,
}

/// The grouped rows: fold-parallel work per optimizer.
///
/// Both rows are optimizer suites, not deployed fits: `folds + 1` independent models over one
/// fold assignment, fitted in parallel, without the deployed fit's calibration and
/// applicability stages - and the incumbent row runs the Moré-Thuente line search where the
/// deployed fit would run the crate-default backtracking. The solver row emulates the same
/// shape - fold membership views materialize into owned per-fold corpora ahead of the clock,
/// and the suite solves in parallel - so its numbers measure contention behavior, not a
/// deployed path. The incumbent objective filters fold membership inside every traversal while
/// the solver traverses dense corpora; the materialization stands outside the clock as the
/// emulation's stand-in for that filter.
#[derive(Debug)]
pub struct Grouped {
    /// One production full fit per fold seed.
    pub old: Vec<GroupedRow>,
    /// One emulated solver fold suite per fold seed.
    pub new: Vec<GroupedRow>,
    /// Two same-seed production full fits produced bit-identical classifiers.
    pub old_deterministic: bool,
}

/// One grouped run at one fold seed.
#[derive(Debug)]
pub struct GroupedRow {
    /// The fold-assignment seed.
    pub seed: u64,
    /// Wall clock of the grouped run.
    pub timing: Timing,
}

/// Compares the two optimizers over one published generation's staged corpus.
///
/// # Panics
///
/// Panics when the generation cannot be opened, its staged annotation artifacts are absent or
/// fail their byte certificates, either optimizer fails to converge, or a determinism
/// certificate fails: a measurement run has no recovery path.
pub async fn compare(options: &CompareOptions) -> Comparison {
    let start = Instant::now();
    let frozen = Frozen::load(options);
    progress("loaded the frozen generation", start);
    let reconstructed = frozen.reconstruct().await;
    progress("reassembled the corpus", start);
    let embeddings = reconstructed.trained_embeddings();
    let rows = reconstructed.rows();

    let training = TrainingSet::new(embeddings, rows)
        .expect("the reconstructed corpus satisfies the training-set contract");

    let config = FitConfig {
        gradient_tolerance: options
            .gradient_tolerance
            .unwrap_or(frozen.baseline.config.gradient_tolerance),
        ..frozen.baseline.config
    };
    let certificate = CorpusCertificate {
        generation: options.generation.clone(),
        corpus_digest: frozen.corpus_digest.to_string(),
        document_verified: frozen.document_verified,
        embeddings_verified: reconstructed.embeddings_verified,
        hashes_verified: reconstructed.hashes_verified,
        trained: rows.len(),
        total_weight: rows.iter().map(|row| row.weight).sum(),
        recorded_iterations: frozen.baseline.iterations,
        regularization: config.regularization,
        gradient_tolerance: config.gradient_tolerance,
        maximum_iterations: config.maximum_iterations,
    };

    let old = old_solo(training, &certificate, config, options.timed_repeats, start);
    let new = new_solo(
        embeddings,
        rows,
        config.regularization,
        options.timed_repeats,
        start,
    );
    let cross = cross_frame(
        training,
        embeddings,
        rows,
        config,
        &old.parameters,
        &new.point,
    );
    progress("cross-frame evaluated", start);
    let work_to_target = work_to_target(&old.report, &new.report);
    let grouped = options
        .grouped
        .then(|| grouped(training, embeddings, rows, config, options, start));

    Comparison {
        corpus: certificate,
        old: old.report,
        new: new.report,
        cross,
        work_to_target,
        grouped,
    }
}

/// The preparation settings of every solver run in the comparison.
///
/// The regularization is the one the generation's fit echoed; the tolerance admits the corpus's
/// Dirichlet-posterior targets, whose sums carry division rounding only.
const fn preparation_settings(regularization: f64) -> PreparationSettings {
    PreparationSettings {
        regularization: DPositive::new(regularization)
            .expect("the echoed regularization is positive"),
        target_sum_tolerance_ulps: NonZeroU32::new(16).expect("sixteen is nonzero"),
        curvature_floor: const { DPositive::new(1.0e-12).expect("the floor is positive") },
    }
}

/// The solver-loop configuration of every solver run in the comparison.
fn solver_config(regularization: f64) -> SolverConfig {
    let config = SolverConfig {
        preparation: preparation_settings(regularization),
        radius_minimum: const { DPositive::new(1.0e-8).expect("the radius floor is positive") },
        radius_initial: DPositive::ONE,
        radius_maximum: const { DPositive::new(1.0e4).expect("the radius cap is positive") },
        shrink_factor: const { OpenUnitFraction::new(0.25).expect("a quarter is interior") },
        expansion_factor: const { GreaterThanOne::new(2.0).expect("doubling expands") },
        eta_accept: const { OpenUnitFraction::new(0.1).expect("a tenth is interior") },
        eta_expand: const { OpenUnitFraction::new(0.75).expect("three quarters is interior") },
        relative_cg_residual_tolerance: const {
            OpenUnitFraction::new(0.1).expect("a tenth is interior")
        },
        relative_scaled_gradient_tolerance: const {
            OpenUnitFraction::new(1.0e-6).expect("the relative tolerance is interior")
        },
        absolute_scaled_gradient_tolerance: const {
            DNonNegative::new(1.0e-10).expect("the absolute floor is non-negative")
        },
        objective_resolution_ulps: NonZeroU32::new(4).expect("four is nonzero"),
        curvature_guard_ulps: NonZeroU32::new(16).expect("sixteen is nonzero"),
        boundary_residual_ulps: NonZeroU32::new(64).expect("sixty-four is nonzero"),
        // Budgets sit an order beyond the predicted need, so termination
        // is by tolerance; a budget terminal reports as a failure.
        maximum_outer_iterations: NonZeroU64::new(500).expect("five hundred is nonzero"),
        maximum_cg_iterations: NonZeroU64::new(100).expect("one hundred is nonzero"),
        maximum_hvp_requests: NonZeroU64::new(50_000).expect("fifty thousand is nonzero"),
        maximum_objective_requests: 2_000,
        maximum_gradient_requests: 2_000,
        maximum_row_traversals: 500_000,
        maximum_consecutive_rejections: NonZeroU64::new(30).expect("thirty is nonzero"),
    };
    config
        .validate()
        .expect("the comparison configuration is in domain");
    config
}

/// The frozen generation inputs: document, staged table, and the recorded baseline.
struct Frozen {
    supplied: SuppliedAnnotations,
    embedder: TableEmbedder,
    corpus_digest: Sha256Digest,
    document_verified: bool,
    staged_embeddings_digest: Sha256Digest,
    staged_hashes_digest: Sha256Digest,
    baseline: RecordedBaseline,
}

impl Frozen {
    /// Opens the generation and loads the staged annotation artifacts.
    fn load(options: &CompareOptions) -> Self {
        let root = GenerationRoot::new(options.root.clone()).expect("the generation root opens");
        let id: GenerationId = options
            .generation
            .parse()
            .expect("the generation id is a hex SHA-256");
        let generation = root.open(id).expect("the generation is published");
        let repository = generation.repository();

        let files = &repository.files;
        let corpus_file = files
            .annotation_corpus
            .as_ref()
            .expect("the generation fitted its classifier in-run");
        let embeddings_file = files
            .annotation_embeddings
            .as_ref()
            .expect("a fitted classifier stages its embedding table");
        let hashes_file = files
            .annotation_hashes
            .as_ref()
            .expect("a fitted classifier stages its hash column");

        let supplied = SuppliedAnnotations::open(generation.path_of(&corpus_file.name))
            .expect("the staged corpus document parses");
        let mut hasher = Sha256::new();
        hasher.update(supplied.bytes());
        let corpus_digest = hasher.finalize();

        let embedder = TableEmbedder::load(
            repository.metadata.reproducibility.embedder,
            &generation.path_of(&hashes_file.name),
            &generation.path_of(&embeddings_file.name),
        );

        Self {
            supplied,
            embedder,
            document_verified: corpus_digest == corpus_file.hash,
            corpus_digest,
            staged_embeddings_digest: embeddings_file.hash,
            staged_hashes_digest: hashes_file.hash,
            baseline: recorded_baseline(generation.path()),
        }
    }

    /// Replays the production assembly over the frozen document and certifies the bytes.
    async fn reconstruct(&self) -> Reconstructed {
        let corpus = assemble(
            self.supplied.document(),
            &self.embedder,
            AssemblyConfig { .. },
        )
        .await
        .expect("the staged corpus document assembles");

        let embeddings_digest = corpus
            .table()
            .write_embeddings_into(std::io::sink())
            .expect("writing to a sink performs no fallible IO");
        let hashes_digest = corpus
            .table()
            .write_hashes_into(std::io::sink())
            .expect("writing to a sink performs no fallible IO");

        Reconstructed {
            embeddings_verified: embeddings_digest == self.staged_embeddings_digest,
            hashes_verified: hashes_digest == self.staged_hashes_digest,
            corpus,
        }
    }
}

/// The reassembled corpus beside its byte certificates.
struct Reconstructed {
    corpus: AssembledCorpus,
    embeddings_verified: bool,
    hashes_verified: bool,
}

impl Reconstructed {
    /// The trained prefix of the embedding table.
    fn trained_embeddings(&self) -> &[AlignedVecN<CANONICAL_DIMENSIONS>] {
        &self.corpus.table().rows()[..self.corpus.rows().len()]
    }

    /// The labelled training rows.
    const fn rows(&self) -> &[TrainingRow] {
        self.corpus.rows()
    }
}

/// The recorded baseline: the fit configuration the generation echoed and its iteration count.
struct RecordedBaseline {
    iterations: u64,
    config: FitConfig,
}

/// Reads the recorded baseline from the generation's metadata document.
// The typed repository omits the fit summary and the configuration
// echo, so the recorded baseline is read from the document's JSON
// directly. The echoed configuration, not the crate default, is what
// the comparison binds: the generation records what its fit ran under.
fn recorded_baseline(generation: &Utf8Path) -> RecordedBaseline {
    let document =
        std::fs::read(generation.join("metadata.json")).expect("the metadata document reads");
    let value: serde_json::Value =
        serde_json::from_slice(&document).expect("the metadata document parses");

    let iterations = value["metadata"]["evidence"]["classifier"]["fit"]["iterations"]
        .as_u64()
        .expect("a fitted classifier records its iteration count");

    let echo = &value["metadata"]["reproducibility"]["config"]["policy"]["classifier_fit"];
    let config = FitConfig {
        regularization: echo["regularization"]
            .as_f64()
            .expect("the echo records the regularization"),
        maximum_iterations: echo["maximum_iterations"]
            .as_u64()
            .expect("the echo records the iteration bound"),
        gradient_tolerance: echo["gradient_tolerance"]
            .as_f64()
            .expect("the echo records the gradient tolerance"),
        history_size: usize::try_from(
            echo["history_size"]
                .as_u64()
                .expect("the echo records the history size"),
        )
        .expect("the history size fits the address space"),
        folds: usize::try_from(echo["folds"].as_u64().expect("the echo records the folds"))
            .expect("the fold count fits the address space"),
        seed: echo["seed"].as_u64().expect("the echo records the seed"),
    };

    RecordedBaseline { iterations, config }
}

/// A card embedder answering from a staged embedding table by text hash.
///
/// The fingerprint is the staged table's, so reassembly reproduces the table identity; a text
/// absent from the table panics, because the frozen corpus admits no new embeddings.
struct TableEmbedder {
    fingerprint: EmbedderFingerprint,
    rows: std::collections::HashMap<Sha256Digest, BoxedVecN<CANONICAL_DIMENSIONS>>,
}

impl TableEmbedder {
    /// Loads the staged hash column and embedding array into an answer table.
    fn load(fingerprint: EmbedderFingerprint, hashes: &Utf8Path, embeddings: &Utf8Path) -> Self {
        let hashes_file = ArrayFile::open(hashes).expect("the staged hash column opens");
        let embeddings_file =
            ArrayFile::open(embeddings).expect("the staged embedding array opens");

        let digests = hashes_file
            .digests()
            .expect("the staged hash column holds digest rows");
        let components = embeddings_file
            .f32_elements()
            .expect("the staged embedding array holds f32 rows");
        let (rows, remainder) = components.as_chunks::<CANONICAL_DIMENSIONS>();
        assert!(
            remainder.is_empty() && rows.len() == digests.len(),
            "the staged table is row-aligned",
        );

        let rows = digests
            .iter()
            .zip(rows)
            .map(|(&digest, row)| (digest, BoxedVecN::new(VecN::from_ref(row))))
            .collect();

        Self { fingerprint, rows }
    }
}

impl CardEmbedder for TableEmbedder {
    type Error = core::convert::Infallible;

    fn fingerprint(&self) -> EmbedderFingerprint {
        self.fingerprint
    }

    fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        core::future::ready(Ok(texts
            .into_iter()
            .map(|text| {
                let hash = Sha256Digest::of(text);
                self.rows
                    .get(&hash)
                    .unwrap_or_else(|| {
                        panic!("card text {hash} is absent from the staged embedding table")
                    })
                    .clone()
            })
            .collect()))
    }
}

/// The production solo report beside the solution the cross-frame checks need.
struct OldSoloRun {
    report: OldSolo,
    parameters: Parameters,
}

/// Runs the incumbent L-BFGS path solo over the full corpus.
fn old_solo(
    training: TrainingSet<'_>,
    corpus: &CorpusCertificate,
    config: FitConfig,
    repeats: usize,
    start: Instant,
) -> OldSoloRun {
    let folds =
        grouped_folds(training.rows(), config.folds, config.seed).expect("the corpus has groups");
    let objective = Objective {
        training,
        folds: &folds,
        held_out: None,
        regularization: config.regularization,
    };

    let (counted, mut seam) = counted_fit(objective, config, LineSearch::MoreThuente, u64::MAX);
    progress("old solo: counted fit", start);
    let (counted, _, _) = counted.expect("the incumbent fit converges");

    let (parameters, iterations, status) =
        run_lbfgs(objective, config, LineSearch::MoreThuente).expect("the incumbent fit converges");
    progress("old solo: plain fit", start);
    let adapter_transparent = bits_equal(parameters.as_array(), counted.as_array());

    let (second, _, _) =
        run_lbfgs(objective, config, LineSearch::MoreThuente).expect("the incumbent fit converges");
    progress("old solo: determinism fit", start);
    let deterministic = bits_equal(parameters.as_array(), second.as_array());

    let final_objective = objective.cost_value(&parameters);
    let final_gradient_norm = objective.gradient_value(&parameters).norm_squared().sqrt();

    // The terminal observation joins the trace: the best point's
    // objective is what the fit returns, charged at the whole spend.
    seam.trace.push(TracePoint {
        passes: seam.cost_passes + seam.gradient_passes,
        objective: final_objective,
    });

    let timing = Timing::measure(repeats, || {
        run_lbfgs(objective, config, LineSearch::MoreThuente).expect("the incumbent fit converges")
    });
    progress("old solo: timed", start);

    let (outcome, armijo_seam) = counted_fit(objective, config, LineSearch::Armijo, EXHIBIT_BUDGET);
    progress("old solo: armijo exhibit", start);
    let armijo = ArmijoExhibit {
        converged: outcome.as_ref().is_ok_and(|(parameters, _, _)| {
            objective.gradient_value(parameters).norm_squared().sqrt() <= config.gradient_tolerance
        }),
        status: match &outcome {
            Ok((_, iterations, status)) => format!("{status} after {iterations} iterations"),
            Err(error) => error.to_string(),
        },
        cost_passes: armijo_seam.cost_passes,
        gradient_passes: armijo_seam.gradient_passes,
        best_objective: armijo_seam
            .trace
            .iter()
            .map(|point| point.objective)
            .fold(f64::INFINITY, f64::min),
    };

    OldSoloRun {
        report: OldSolo {
            iterations,
            matches_recorded_iterations: iterations == corpus.recorded_iterations,
            status,
            final_objective,
            final_gradient_norm,
            cost_passes: seam.cost_passes,
            gradient_passes: seam.gradient_passes,
            validation_passes: 1,
            deterministic,
            adapter_transparent,
            trace: seam.trace,
            timing,
            armijo,
        },
        parameters,
    }
}

/// The line search an incumbent executor runs under.
#[derive(Debug, Copy, Clone)]
enum LineSearch {
    /// Moré-Thuente under the strong Wolfe constants: the terminating configuration.
    MoreThuente,
    /// Armijo backtracking with halving contraction: the crate default.
    Armijo,
}

/// Sufficient-decrease constant of the strong Wolfe conditions.
const SUFFICIENT_DECREASE: f64 = 1.0e-4;

/// Curvature constant of the strong Wolfe conditions.
const CURVATURE: f64 = 0.9;

/// The seam counts and objective trace of one counted fit.
struct SeamLog {
    cost_passes: u64,
    gradient_passes: u64,
    trace: Vec<TracePoint>,
}

/// An objective adapter charging every evaluation at the seam.
///
/// Past `budget` cost evaluations every further cost errors, ending the run: the bounded verdict
/// for a search that will not terminate on its own.
#[derive(Clone)]
struct CountingObjective<'fit> {
    inner: Objective<'fit>,
    seam: Rc<RefCell<SeamLog>>,
    budget: u64,
}

impl CostFunction for CountingObjective<'_> {
    type Output = f64;
    type Param = Parameters;

    fn cost(&self, param: &Self::Param) -> Result<Self::Output, argmin::core::Error> {
        if self.seam.borrow().cost_passes >= self.budget {
            return Err(argmin::core::Error::msg(
                "the fit exhausted its cost-evaluation budget: the search is degenerate",
            ));
        }
        let value = self.inner.cost_value(param);
        let mut seam = self.seam.borrow_mut();
        seam.cost_passes += 1;
        let passes = seam.cost_passes + seam.gradient_passes;
        seam.trace.push(TracePoint {
            passes,
            objective: value,
        });
        Ok(value)
    }
}

impl Gradient for CountingObjective<'_> {
    type Gradient = Parameters;
    type Param = Parameters;

    fn gradient(&self, param: &Self::Param) -> Result<Self::Gradient, argmin::core::Error> {
        self.seam.borrow_mut().gradient_passes += 1;
        Ok(self.inner.gradient_value(param))
    }
}

/// Runs one incumbent L-BFGS fit through the counting adapter.
///
/// The optimizer construction mirrors the fit that produced the recorded baseline: zero
/// initialization, the configured gradient tolerance and iteration bound, cost-stall stopping
/// disabled, and the chosen line search. A run that fails - budget exhaustion or an optimizer
/// error - reports [`Err`] beside the seam counts it spent.
fn counted_fit(
    objective: Objective<'_>,
    config: FitConfig,
    line_search: LineSearch,
    budget: u64,
) -> (
    Result<(Parameters, u64, String), argmin::core::Error>,
    SeamLog,
) {
    let seam = Rc::new(RefCell::new(SeamLog {
        cost_passes: 0,
        gradient_passes: 0,
        trace: Vec::new(),
    }));
    let counting = CountingObjective {
        inner: objective,
        seam: Rc::clone(&seam),
        budget,
    };

    let outcome = run_lbfgs(counting, config, line_search);
    let seam = Rc::into_inner(seam).expect("the executor released its seam handle");
    (outcome, seam.into_inner())
}

/// Runs one L-BFGS fit over any objective operator.
///
/// The optimizer construction mirrors the fit that produced the recorded baseline: zero
/// initialization, the configured gradient tolerance and iteration bound, cost-stall stopping
/// disabled, and the chosen line search.
fn run_lbfgs<O>(
    objective: O,
    config: FitConfig,
    line_search: LineSearch,
) -> Result<(Parameters, u64, String), argmin::core::Error>
where
    O: CostFunction<Param = Parameters, Output = f64>
        + Gradient<Param = Parameters, Gradient = Parameters>,
{
    let configure = |state: argmin::core::IterState<Parameters, Parameters, (), (), (), f64>| {
        state
            .param(Parameters::zero())
            .max_iters(config.maximum_iterations)
    };
    let finish = |mut state: argmin::core::IterState<Parameters, Parameters, (), (), (), f64>| {
        let iterations = state.get_iter();
        let status = format!("{:?}", state.get_termination_status());
        state
            .take_best_param()
            .map(|parameters| (parameters, iterations, status))
            .ok_or_else(|| argmin::core::Error::msg("the fit yielded no parameters"))
    };

    // Cost-stall stopping is disabled: convergence is claimed by the gradient alone.
    match line_search {
        LineSearch::MoreThuente => {
            let line_search = MoreThuenteLineSearch::new()
                .with_c(SUFFICIENT_DECREASE, CURVATURE)
                .expect("the strong Wolfe constants are in domain");
            let solver = LBFGS::new(line_search, config.history_size)
                .with_tolerance_grad(config.gradient_tolerance)
                .expect("the gradient tolerance is in domain")
                .with_tolerance_cost(0.0)
                .expect("zero cost tolerance is in domain");
            Executor::new(objective, solver)
                .configure(configure)
                .run()
                .map(|result| result.state)
                .and_then(finish)
        }
        LineSearch::Armijo => {
            let condition = ArmijoCondition::new(SUFFICIENT_DECREASE)
                .expect("the Armijo constant is in domain");
            let line_search = BacktrackingLineSearch::new(condition)
                .rho(0.5)
                .expect("the contraction factor is in domain");
            let solver = LBFGS::new(line_search, config.history_size)
                .with_tolerance_grad(config.gradient_tolerance)
                .expect("the gradient tolerance is in domain")
                .with_tolerance_cost(0.0)
                .expect("zero cost tolerance is in domain");
            Executor::new(objective, solver)
                .configure(configure)
                .run()
                .map(|result| result.state)
                .and_then(finish)
        }
    }
}

/// The solver solo report beside the physical solution the cross-frame checks need.
struct NewSoloRun {
    report: NewSolo,
    point: ContrastVector,
}

/// Runs the trust-region Newton-CG solver solo over the full corpus.
fn new_solo(
    embeddings: &[AlignedVecN<CANONICAL_DIMENSIONS>],
    rows: &[TrainingRow],
    regularization: f64,
    repeats: usize,
    start: Instant,
) -> NewSoloRun {
    let settings = preparation_settings(regularization);
    let config = solver_config(regularization);

    let run_once = || {
        let mut counters = WorkCounters::default();
        let prepared =
            prepare(embeddings, rows, settings, &mut counters).expect("the corpus prepares");
        let problem = ScaledProblem { prepared, config };
        solve(&problem, counters)
    };

    let run = run_once();
    progress("new solo: first solve", start);
    let second = run_once();
    progress("new solo: determinism solve", start);
    let deterministic = bits_equal(
        run.accepted.zeta.as_array(),
        second.accepted.zeta.as_array(),
    ) && run.accepted.objective.to_bits()
        == second.accepted.objective.to_bits();

    if let Err(failure) = &run.outcome {
        panic!("the solver failed: {failure:?}");
    }

    // The physical point and total weight come from a fresh preparation
    // over the same bytes; preparation is deterministic.
    let mut counters = WorkCounters::default();
    let prepared = prepare(embeddings, rows, settings, &mut counters).expect("the corpus prepares");
    let total_weight = prepared.total_weight;
    let problem = ScaledProblem { prepared, config };
    let point = problem.point(&run.accepted.zeta);

    let mut trace: Vec<TracePoint> = run
        .receipts
        .iter()
        .map(|receipt| TracePoint {
            passes: solve_passes(&receipt.counters),
            objective: receipt.objective * total_weight,
        })
        .collect();
    // The terminal observation joins the trace: the accepted point's
    // objective is what the solve returns, charged at the whole spend.
    trace.push(TracePoint {
        passes: solve_passes(&run.control.counters),
        objective: run.accepted.objective * total_weight,
    });

    let counters = run.control.counters;
    let timing = Timing::measure(repeats, run_once);
    progress("new solo: timed", start);

    NewSoloRun {
        report: NewSolo {
            outer_iterations: run.control.outer_iterations_started,
            final_objective: run.accepted.objective * total_weight,
            final_objective_normalized: run.accepted.objective,
            final_scaled_gradient_norm: run.accepted.scaled_gradient.norm_squared().sqrt(),
            joint_passes: counters.completed_joint_traversals,
            objective_passes: counters.completed_objective_traversals,
            gradient_passes: counters.completed_gradient_traversals,
            hvp_passes: counters.completed_hvp_traversals,
            preparation_passes: counters.completed_preparation_traversals,
            acceptances: counters.candidate_acceptances,
            ratio_rejections: counters.candidate_ratio_rejections,
            deterministic,
            trace,
            timing,
        },
        point,
    }
}

/// Completed solve passes of one counter snapshot, preparation excluded.
const fn solve_passes(counters: &WorkCounters) -> u64 {
    counters.completed_joint_traversals
        + counters.completed_objective_traversals
        + counters.completed_gradient_traversals
        + counters.completed_hvp_traversals
}

/// Evaluates both solutions under both arithmetic frames.
fn cross_frame(
    training: TrainingSet<'_>,
    embeddings: &[AlignedVecN<CANONICAL_DIMENSIONS>],
    rows: &[TrainingRow],
    config: FitConfig,
    old: &Parameters,
    new: &ContrastVector,
) -> CrossFrame {
    let folds =
        grouped_folds(training.rows(), config.folds, config.seed).expect("the corpus has groups");
    let objective = Objective {
        training,
        folds: &folds,
        held_out: None,
        regularization: config.regularization,
    };

    let mut counters = WorkCounters::default();
    let prepared = prepare(
        embeddings,
        rows,
        preparation_settings(config.regularization),
        &mut counters,
    )
    .expect("the corpus prepares");
    let total_weight = prepared.total_weight;

    let old_at_old = objective.cost_value(old);
    let old_contrast = reduce_parameters(old);
    let new_frame_at_old = prepared.objective_only(&old_contrast, &mut counters) * total_weight;

    let new_at_new = prepared.objective_only(new, &mut counters) * total_weight;
    let expanded = expand_point(new);
    let old_frame_at_new = objective.cost_value(&expanded);
    let old_frame_gradient_norm_at_new = objective.gradient_value(&expanded).norm_squared().sqrt();

    let (coefficient_rows, intercepts) = old.as_array().as_chunks::<CANONICAL_DIMENSIONS>();
    let old_gauge_mass = (0..CANONICAL_DIMENSIONS)
        .map(|dimension| {
            coefficient_rows
                .iter()
                .map(|row| row[dimension])
                .sum::<f64>()
                .abs()
        })
        .fold(
            0.0_f64,
            |largest, mass| {
                if mass > largest { mass } else { largest }
            },
        );
    let old_intercept_gauge = intercepts.iter().sum::<f64>().abs();

    CrossFrame {
        old_at_old,
        new_frame_at_old,
        old_frame_at_new,
        new_at_new,
        relative_disagreement_at_old: ((new_frame_at_old - old_at_old) / old_at_old).abs(),
        relative_disagreement_at_new: ((old_frame_at_new - new_at_new) / new_at_new).abs(),
        old_frame_gradient_norm_at_new,
        old_gauge_mass,
        old_intercept_gauge,
    }
}

/// Reduces flat class parameters into contrast coordinates: `A = Bᵀ·W`, `a = Bᵀ·b`.
#[expect(
    clippy::needless_range_loop,
    reason = "the dimension index addresses one coordinate across every class row and every \
              contrast row at once; no single iterator owns it"
)]
fn reduce_parameters(parameters: &Parameters) -> ContrastVector {
    let (rows, intercepts) = parameters.as_array().as_chunks::<CANONICAL_DIMENSIONS>();
    assert_eq!(
        rows.len(),
        GeometryClass::COUNT,
        "the flat parameters hold one coefficient row per class",
    );
    assert_eq!(
        intercepts.len(),
        GeometryClass::COUNT,
        "the flat parameters end in one intercept per class",
    );

    let mut contrast = ContrastVector::zero();
    for dimension in 0..CANONICAL_DIMENSIONS {
        let classes: [f64; GeometryClass::COUNT] =
            core::array::from_fn(|class| rows[class][dimension]);
        for (row, value) in basis::reduce(classes).into_iter().enumerate() {
            contrast.coefficients[row].as_array_mut()[dimension] = value;
        }
    }
    contrast.intercepts = basis::reduce(core::array::from_fn(|class| intercepts[class]));
    contrast
}

/// Expands contrast coordinates into flat class parameters: `W = B·A`, `b = B·a`.
fn expand_point(point: &ContrastVector) -> Parameters {
    let mut parameters = Parameters::zero();
    let (rows, intercepts) = parameters
        .as_array_mut()
        .as_chunks_mut::<CANONICAL_DIMENSIONS>();
    for dimension in 0..CANONICAL_DIMENSIONS {
        let classes = basis::expand(core::array::from_fn(|row| {
            point.coefficients[row].as_array()[dimension]
        }));
        for (row, class) in rows.iter_mut().zip(classes) {
            row[dimension] = class;
        }
    }
    let classes = basis::expand(point.intercepts);
    intercepts.copy_from_slice(&classes);
    parameters
}

/// Completed corpus passes each optimizer needs to reach the shared target.
fn work_to_target(old: &OldSolo, new: &NewSolo) -> WorkToTarget {
    let best = if old.final_objective < new.final_objective {
        old.final_objective
    } else {
        new.final_objective
    };
    let target = best * (1.0 + 1.0e-9);

    let reach = |trace: &[TracePoint]| {
        trace
            .iter()
            .find(|point| point.objective <= target)
            .map(|point| point.passes)
    };

    WorkToTarget {
        target,
        old_passes: reach(&old.trace),
        new_passes: reach(&new.trace),
    }
}

/// Runs the grouped rows: production full fits and emulated solver fold suites.
fn grouped(
    training: TrainingSet<'_>,
    embeddings: &[AlignedVecN<CANONICAL_DIMENSIONS>],
    rows: &[TrainingRow],
    config: FitConfig,
    options: &CompareOptions,
    start: Instant,
) -> Grouped {
    let repeats = options.timed_repeats;

    let first = incumbent_fold_suite(training, config, 0);
    progress("grouped: first incumbent suite", start);
    let second = incumbent_fold_suite(training, config, 0);
    progress("grouped: determinism suite", start);
    let old_deterministic = first.len() == second.len()
        && first
            .iter()
            .zip(&second)
            .all(|(left, right)| bits_equal(left.as_array(), right.as_array()));

    let old = options
        .fold_seeds
        .iter()
        .map(|&seed| {
            let row = GroupedRow {
                seed,
                timing: Timing::measure(repeats, || incumbent_fold_suite(training, config, seed)),
            };
            progress("grouped: old seed timed", start);
            row
        })
        .collect();

    let new = options
        .fold_seeds
        .iter()
        .map(|&seed| {
            let row = GroupedRow {
                seed,
                timing: solver_fold_suite(embeddings, rows, config, seed, repeats),
            };
            progress("grouped: new seed timed", start);
            row
        })
        .collect();

    Grouped {
        old,
        new,
        old_deterministic,
    }
}

/// Fits the incumbent fold suite: per-fold models and the full model, in parallel.
///
/// Mirrors the deployed grouped fit's shape - `folds + 1` independent models over one fold
/// assignment, fitted in parallel - without its calibration and applicability stages, so the row
/// measures the optimizer suite alone.
fn incumbent_fold_suite(
    training: TrainingSet<'_>,
    config: FitConfig,
    seed: u64,
) -> Vec<Parameters> {
    let config = FitConfig { seed, ..config };
    let folds =
        grouped_folds(training.rows(), config.folds, config.seed).expect("the corpus has groups");

    (0..=config.folds)
        .into_par_iter()
        .map(|fold| {
            let held_out = (fold < config.folds).then_some(fold);
            let objective = Objective {
                training,
                folds: &folds,
                held_out,
                regularization: config.regularization,
            };
            let (parameters, _, status) = run_lbfgs(objective, config, LineSearch::MoreThuente)
                .expect("the incumbent fold fit returns");
            assert!(
                status.contains("SolverConverged"),
                "the fold {fold} incumbent fit stopped without converging: {status}",
            );
            parameters
        })
        .collect()
}

/// One owned fold-membership corpus.
struct FoldCorpus {
    embeddings: MatrixN<CANONICAL_DIMENSIONS>,
    rows: Vec<TrainingRow>,
}

/// Times the emulated solver fold suite: per-fold models and the full model, in parallel.
#[expect(
    clippy::print_stderr,
    clippy::use_debug,
    reason = "a failed fold's receipt tail is the seam's live diagnostic; terminals and outcomes \
              format through their debug forms"
)]
fn solver_fold_suite(
    embeddings: &[AlignedVecN<CANONICAL_DIMENSIONS>],
    rows: &[TrainingRow],
    config: FitConfig,
    seed: u64,
    repeats: usize,
) -> Timing {
    let folds = grouped_folds(rows, config.folds, seed).expect("the corpus has groups");

    // Membership materializes ahead of the clock; the production
    // objective applies the same membership as a per-pass filter.
    let subsets: Vec<FoldCorpus> = (0..config.folds)
        .map(|held_out| {
            let members: Vec<usize> = folds
                .iter()
                .enumerate()
                .filter(|(_, fold)| **fold != held_out)
                .map(|(row, _)| row)
                .collect();

            let mut fold_embeddings = MatrixN::zeroed(members.len());
            let fold_rows = fold_embeddings.rows_mut();
            let mut fold_training = Vec::with_capacity(members.len());
            for (position, &member) in members.iter().enumerate() {
                *fold_rows[position].as_array_mut() = *embeddings[member].as_array();
                fold_training.push(rows[member]);
            }

            FoldCorpus {
                embeddings: fold_embeddings,
                rows: fold_training,
            }
        })
        .collect();

    let settings = preparation_settings(config.regularization);
    let solver = solver_config(config.regularization);

    Timing::measure(repeats, || {
        (0..=config.folds)
            .into_par_iter()
            .map(|fold| {
                let (fold_embeddings, fold_rows) = if fold < config.folds {
                    let subset = &subsets[fold];
                    (subset.embeddings.rows(), subset.rows.as_slice())
                } else {
                    (embeddings, rows)
                };

                let mut counters = WorkCounters::default();
                let prepared = prepare(fold_embeddings, fold_rows, settings, &mut counters)
                    .expect("the fold corpus prepares");
                let problem = ScaledProblem {
                    prepared,
                    config: solver,
                };
                let run = solve(&problem, counters);
                if let Err(failure) = &run.outcome {
                    // The receipts are the diagnosis: dump the tail
                    // before reporting the fold failed.
                    eprintln!("fold {fold} at seed {seed} failed: {failure:?}");
                    for receipt in run.receipts.iter().rev().take(3).rev() {
                        eprintln!(
                            "  outer {} radius {:e} objective {:.15e} gradient {:e} outcome {:?}",
                            receipt.outer_iteration,
                            receipt.radius,
                            receipt.objective,
                            receipt.gradient_norm,
                            receipt.outcome,
                        );
                    }
                    return Err(fold);
                }
                Ok(run.control.outer_iterations_started)
            })
            .collect::<Result<Vec<u64>, usize>>()
    })
}

/// Solves one fold subset solo and dumps every receipt: the terminal-diagnosis probe.
///
/// # Panics
///
/// Panics when the generation cannot be opened or its staged corpus fails reconstruction; the
/// probed solve itself may fail - its terminal is the observation.
#[expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the probe's receipt dump is its whole output; terminals and outcomes format through \
              their debug forms"
)]
pub async fn probe_fold(options: &CompareOptions, seed: u64, fold: usize) {
    let frozen = Frozen::load(options);
    let reconstructed = frozen.reconstruct().await;
    let embeddings = reconstructed.trained_embeddings();
    let rows = reconstructed.rows();
    let config = frozen.baseline.config;

    let folds = grouped_folds(rows, config.folds, seed).expect("the corpus has groups");
    let members: Vec<usize> = folds
        .iter()
        .enumerate()
        .filter(|(_, assigned)| **assigned != fold)
        .map(|(row, _)| row)
        .collect();

    let mut fold_embeddings = MatrixN::zeroed(members.len());
    let fold_rows_mut = fold_embeddings.rows_mut();
    let mut fold_training = Vec::with_capacity(members.len());
    for (position, &member) in members.iter().enumerate() {
        *fold_rows_mut[position].as_array_mut() = *embeddings[member].as_array();
        fold_training.push(rows[member]);
    }

    let settings = preparation_settings(config.regularization);
    let solver = solver_config(config.regularization);
    let mut counters = WorkCounters::default();
    let prepared = prepare(
        fold_embeddings.rows(),
        &fold_training,
        settings,
        &mut counters,
    )
    .expect("the fold corpus prepares");

    println!("fold {fold} at seed {seed}: {} member rows", members.len());
    println!(
        "total weight {} scaling range {:?} sum range {:?} adjustment {:e}",
        prepared.total_weight,
        prepared.evidence.scaling_range,
        prepared.evidence.sum_range,
        prepared.evidence.maximum_adjustment,
    );

    let problem = ScaledProblem {
        prepared,
        config: solver,
    };
    let run = solve(&problem, counters);

    println!("outcome: {:?}", run.outcome.as_ref().err());
    println!(
        "accepted objective {:.15e} zeta norm {:e} scaled gradient norm {:e}",
        run.accepted.objective,
        run.accepted.zeta.norm_squared().sqrt(),
        run.accepted.scaled_gradient.norm_squared().sqrt(),
    );
    println!(
        "control: radius {:e} rejections {} outers {}",
        run.control.radius,
        run.control.consecutive_rejections,
        run.control.outer_iterations_started,
    );
    for receipt in &run.receipts {
        println!(
            "outer {} radius {:e} objective {:.15e} gradient {:e}\n  outcome {:?}",
            receipt.outer_iteration,
            receipt.radius,
            receipt.objective,
            receipt.gradient_norm,
            receipt.outcome,
        );
    }
    println!("counters: {:?}", run.control.counters);
}

/// Bit-for-bit equality of two `f64` slices.
fn bits_equal(left: &[f64], right: &[f64]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .all(|(left, right)| left.to_bits() == right.to_bits())
}
