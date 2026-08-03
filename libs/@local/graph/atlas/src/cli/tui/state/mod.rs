//! The dashboard's model of one run.
//!
//! [`RunState`] holds the stage progression, the embedding workload, the projector's loss curve and
//! placement, the admission probe's readings, and the log tail. It absorbs [`Observation`]s and
//! answers the questions the renderer asks - what is each stage doing, how far the paid embedding
//! has come, how the placement is descending, where its rows currently sit, and what the run has
//! said lately. The model holds no terminal and no channel, and its only clock is the run's start,
//! so the whole reduction is exercisable without drawing anything.

use alloc::collections::VecDeque;
use core::time::Duration;
use std::time::Instant;

use crate::{
    math::Vec2,
    progress::{Batch, DescentIteration, Stage},
    salt::{
        embedding::CardEmbeddingStats, knn::recall::RecallSpotCheck,
        projector::train::LossBreakdown, quality::QualityMetric,
    },
};

/// Log lines the dashboard keeps behind the visible tail.
///
/// A tall terminal shows a few dozen; the rest are scrollback the pane does not offer yet, kept
/// bounded so a long run cannot grow the model without limit.
const LOG_CAPACITY: usize = 256;

/// What one stage is doing, from the completions observed so far.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) enum StageStatus {
    /// Completed, in the reported span.
    Done(Duration),
    /// The stage the run is inside, running for the reported span.
    Running(Duration),
    /// Not yet reached.
    Pending,
}

/// One card-embedding workload, with the split that sized it and what the provider has returned.
///
/// `reused` and `embedded` partition the run's distinct card texts; `done` counts the `embedded`
/// share that has come back, so a workload served entirely from the prior generation is complete at
/// `embedded == 0`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct EmbeddingWorkload {
    /// Unique texts the prior generation covered.
    pub reused: usize,
    /// Unique texts the run submitted to the provider.
    pub embedded: usize,
    /// Texts of the provider's share that have come back.
    pub done: usize,
}

/// Training steps the loss curve keeps.
///
/// A schedule is a few thousand steps, so the whole curve normally fits and the chart shows the
/// run's entire descent; a longer schedule scrolls, oldest first, rather than growing the model.
const LOSS_CAPACITY: usize = 4_096;

/// One classifier fit's cross-validation folds, how many there are and how many have completed.
///
/// The folds fit in parallel and report in completion order, so the model counts arrivals rather
/// than tracking which index is outstanding.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct ClassifierFolds {
    /// Cross-validation folds the fit will run.
    pub total: usize,
    /// Folds that have completed.
    pub done: usize,
}

/// One placement training run, how far it has come and the loss curve it has drawn.
///
/// `losses` is the retained tail of the composite objective, oldest first, so the window is the
/// curve: `done` places it on the schedule, and the chart draws its offsets.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct ProjectorTraining {
    /// Steps the schedule will run.
    pub steps: usize,
    /// Steps reported so far.
    pub done: usize,
    /// The retained composite losses, oldest first.
    pub losses: VecDeque<f32>,
    /// The last reported breakdown, by objective family.
    pub last: LossBreakdown,
}

/// What the neighbour-table construction is doing, from its latest observation.
///
/// A construction runs one part at a time and always in the same order. Every row goes into the
/// search backend, the backend does its own linking (or NN-Descent runs its iterations, which need
/// no backend), every row's list comes back out, and the recall verdict arrives last. Each
/// observation therefore replaces the last instead of accumulating. The model carries the
/// construction's newest word, which is what the stage is doing.
#[derive(Debug, Clone, PartialEq)]
pub(super) enum KnnActivity {
    /// Rows entering the search backend.
    Inserting(Batch),
    /// The backend's build phase, in the backend's own vocabulary.
    Building(String),
    /// The latest NN-Descent iteration's convergence reading.
    Descending(DescentIteration),
    /// Rows whose neighbour lists have come back out.
    Reading(Batch),
    /// The construction's measured recall against the exact reference sample.
    Measured(RecallSpotCheck),
}

/// One placement snapshot of where the sampled corpus rows currently are.
///
/// `positions[..landmarks]` are the landmark rows - the skeleton the placement hangs on - and the
/// rest is the interior sample. Each snapshot replaces the last: the map says where the placement
/// is, not where it has been.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct PlacementMap {
    /// The sampled positions, landmark rows first.
    pub positions: Vec<Vec2>,
    /// How many leading positions are landmark rows.
    pub landmarks: usize,
}

/// One thing the run reported, either a progress observation or a line it logged.
///
/// This is the model's whole input vocabulary. Each variant owns what the run handed one
/// [`Progress`] method, so a reporting thread parts with it and never waits on the renderer -
/// except [`Knn`](Self::Knn), where one stage's five observations arrive as the one activity
/// vocabulary they fold into.
///
/// [`Progress`]: crate::progress::Progress
#[derive(Debug)]
pub(super) enum Observation {
    /// A card-embedding workload resolved its reuse split.
    EmbeddingStarted(CardEmbeddingStats),
    /// The provider returned another embedding chunk.
    EmbeddingBatch(Batch),
    /// The corpus assembly derived its near-duplicate boundary.
    AssemblyBoundary(f64),
    /// The classifier fit announced its cross-validation folds.
    ClassifierStarted(usize),
    /// One cross-validation fold landed.
    ClassifierFoldCompleted,
    /// The classifier fit selected its regularization strength.
    ClassifierRegularization(f64),
    /// The placement took another training step.
    ProjectorStep {
        /// The step's zero-based index in the schedule.
        step: usize,
        /// Steps the schedule will run.
        steps: usize,
        /// The step's objective, family by family.
        loss: LossBreakdown,
    },
    /// The neighbour-table construction reported its latest activity.
    Knn(KnnActivity),
    /// A refresh tick reported where the sampled rows sit.
    ProjectorSnapshot {
        /// The sampled positions, landmark rows first.
        positions: Vec<Vec2>,
        /// How many leading positions are landmark rows.
        landmarks: usize,
    },
    /// The admission probe measured one quality metric.
    QualityProbe {
        /// The metric the probe measured.
        metric: QualityMetric,
        /// The reading its control turns on.
        reading: f64,
    },
    /// A pipeline stage completed.
    StageCompleted(Stage),
    /// The run wrote one whole log line.
    Logged(String),
}

/// One run's observed progress.
#[derive(Debug)]
pub(super) struct RunState {
    /// When the run started, the origin of every span the dashboard reports.
    started: Instant,
    /// Elapsed at each stage's completion, indexed as [`Stage::ALL`].
    completed: [Option<Duration>; Stage::ALL.len()],
    /// The embedding workload in flight, from the last split the run resolved.
    embedding: Option<EmbeddingWorkload>,
    /// The assembly's derived near-duplicate boundary, once the grouping derives it.
    assembly_boundary: Option<f64>,
    /// The classifier fit's folds, once it announces them.
    classifier: Option<ClassifierFolds>,
    /// The classifier fit's selected regularization strength, once chosen.
    classifier_regularization: Option<f64>,
    /// The neighbour-table construction's latest activity, once it reports one.
    knn: Option<KnnActivity>,
    /// The placement's training, once its first step reports.
    projector: Option<ProjectorTraining>,
    /// The placement's sampled rows, once a refresh tick reports them.
    placement: Option<PlacementMap>,
    /// The admission probe's readings, indexed as [`QualityMetric::ALL`].
    ///
    /// A control whose evidence is absent reports nothing, so a slot stays empty for a metric the
    /// probe could not measure as well as for one it has not measured yet. The rail draws what
    /// landed and invents nothing for the rest.
    quality: [Option<f64>; QualityMetric::ALL.len()],
    /// The run's log tail, oldest first.
    log: VecDeque<String>,
}

impl RunState {
    /// Opens the model at the run's start.
    pub(super) fn new() -> Self {
        Self {
            started: Instant::now(),
            completed: [None; Stage::ALL.len()],
            embedding: None,
            assembly_boundary: None,
            classifier: None,
            classifier_regularization: None,
            knn: None,
            projector: None,
            placement: None,
            quality: [None; QualityMetric::ALL.len()],
            log: VecDeque::with_capacity(LOG_CAPACITY),
        }
    }

    /// Folds one observation into the model.
    pub(super) fn absorb(&mut self, observation: Observation) {
        match observation {
            Observation::EmbeddingStarted(stats) => self.start_embedding(&stats),
            Observation::EmbeddingBatch(batch) => self.advance_embedding(batch),
            Observation::AssemblyBoundary(epsilon) => self.derive_assembly_boundary(epsilon),
            Observation::ClassifierStarted(folds) => self.start_classifier(folds),
            Observation::ClassifierFoldCompleted => self.complete_classifier_fold(),
            Observation::ClassifierRegularization(regularization) => {
                self.select_regularization(regularization);
            }
            Observation::Knn(activity) => self.report_knn(activity),
            Observation::ProjectorStep { step, steps, loss } => {
                self.advance_projector(step, steps, &loss);
            }
            Observation::ProjectorSnapshot {
                positions,
                landmarks,
            } => self.place_projector(positions, landmarks),
            Observation::QualityProbe { metric, reading } => self.probe_quality(metric, reading),
            Observation::StageCompleted(stage) => self.complete(stage),
            Observation::Logged(line) => self.push_log(line),
        }
    }

    /// Opens a card-embedding workload at its resolved split.
    ///
    /// A run embeds more than one workload - a supplied annotation corpus before the cards - and
    /// each split replaces the last: the counter always describes the workload in flight.
    pub(super) const fn start_embedding(&mut self, stats: &CardEmbeddingStats) {
        self.embedding = Some(EmbeddingWorkload {
            reused: stats.reused,
            embedded: stats.embedded,
            done: 0,
        });
    }

    /// Advances the open workload to a completed request's position.
    ///
    /// This drops a batch without a split rather than guessing at it: the provider's count
    /// describes its own workload, and nothing here may invent the reuse the split reported.
    pub(super) const fn advance_embedding(&mut self, batch: Batch) {
        let Some(workload) = self.embedding.as_mut() else {
            return;
        };

        workload.embedded = batch.total;
        workload.done = batch.done;
    }

    /// Opens the classifier fit's fold counter.
    pub(super) const fn start_classifier(&mut self, folds: usize) {
        self.classifier = Some(ClassifierFolds {
            total: folds,
            done: 0,
        });
    }

    /// Counts one completed cross-validation fold.
    ///
    /// This drops a completion without an announced fold count rather than guessing at it: only the
    /// fit knows how many folds it will run.
    pub(super) const fn complete_classifier_fold(&mut self) {
        let Some(folds) = self.classifier.as_mut() else {
            return;
        };

        folds.done = folds.done.saturating_add(1);
    }

    /// Records the classifier fit's selected regularization strength.
    pub(super) const fn select_regularization(&mut self, regularization: f64) {
        self.classifier_regularization = Some(regularization);
    }

    /// Records the assembly's derived near-duplicate boundary.
    pub(super) const fn derive_assembly_boundary(&mut self, epsilon: f64) {
        self.assembly_boundary = Some(epsilon);
    }

    /// Records what the neighbour-table construction is doing now.
    ///
    /// Each activity replaces the last. The construction's loops, phases and verdict happen in one
    /// order, so nothing behind the newest one is still in flight.
    pub(super) fn report_knn(&mut self, activity: KnnActivity) {
        self.knn = Some(activity);
    }

    /// Records one training step of the placement.
    ///
    /// The first step opens the curve; a later step with a different schedule length opens a fresh
    /// one, so a second training run cannot inherit the first one's descent.
    pub(super) fn advance_projector(&mut self, step: usize, steps: usize, loss: &LossBreakdown) {
        let training = match self.projector.as_mut() {
            Some(training) if training.steps == steps && step >= training.done => training,
            _ => self.projector.insert(ProjectorTraining {
                steps,
                done: 0,
                losses: VecDeque::with_capacity(steps.min(LOSS_CAPACITY)),
                last: LossBreakdown::default(),
            }),
        };

        if training.losses.len() == LOSS_CAPACITY {
            training.losses.pop_front();
        }
        training.losses.push_back(loss.total());
        training.last = *loss;
        // Steps are zero-based and `done` counts them, so the step that
        // reports index `n` is the `n + 1`th of the schedule.
        training.done = step + 1;
    }

    /// Replaces the placement map with the rows a refresh tick reported.
    ///
    /// This clamps a landmark count past the reported rows rather than trusting it: the map draws
    /// the skeleton out of the prefix, and a renderer must not slice past the rows it received.
    pub(super) fn place_projector(&mut self, positions: Vec<Vec2>, landmarks: usize) {
        self.placement = Some(PlacementMap {
            landmarks: landmarks.min(positions.len()),
            positions,
        });
    }

    /// Records one measured quality metric of the admission probe.
    ///
    /// A second reading of the same metric replaces the first: the reading a control turns on is
    /// one reduction over the probe's rungs, so a repeat is a fresher answer to the same question
    /// rather than a second measurement.
    pub(super) fn probe_quality(&mut self, metric: QualityMetric, reading: f64) {
        let Some(index) = QualityMetric::ALL
            .into_iter()
            .position(|candidate| candidate == metric)
        else {
            return;
        };
        self.quality[index] = Some(reading);
    }

    /// Records a stage completion at the run's current elapsed time.
    pub(super) fn complete(&mut self, stage: Stage) {
        self.complete_at(stage, self.started.elapsed());
    }

    /// Records a stage completion at a stated elapsed time.
    ///
    /// The clock-free half of [`complete`](Self::complete): the reduction every test drives.
    pub(super) fn complete_at(&mut self, stage: Stage, elapsed: Duration) {
        let Some(index) = Stage::ALL
            .into_iter()
            .position(|candidate| candidate == stage)
        else {
            return;
        };
        self.completed[index] = Some(elapsed);
    }

    /// Appends one log line, evicting the oldest once the buffer is full.
    pub(super) fn push_log(&mut self, line: String) {
        if self.log.len() == LOG_CAPACITY {
            self.log.pop_front();
        }
        self.log.push_back(line);
    }

    /// How long the run has been going.
    pub(super) fn elapsed(&self) -> Duration {
        self.started.elapsed()
    }

    /// The status of the stage at `index` of [`Stage::ALL`], as of `elapsed`.
    ///
    /// Spans are differences between completions: a stage's own span is the gap between its
    /// completion and its predecessor's, and the running stage's span is the gap since the last
    /// completion. The rail's numbers therefore always sum to the wall clock.
    pub(super) fn status(&self, index: usize, elapsed: Duration) -> StageStatus {
        let previous = index
            .checked_sub(1)
            .and_then(|earlier| self.completed[earlier])
            .unwrap_or_default();

        if let Some(completion) = self.completed[index] {
            return StageStatus::Done(completion.saturating_sub(previous));
        }

        // The run is inside the first stage that has not reported, and it has not reached any stage
        // behind that one.
        if self.completed[..index].iter().all(Option::is_some) {
            StageStatus::Running(elapsed.saturating_sub(previous))
        } else {
            StageStatus::Pending
        }
    }

    /// The embedding workload in flight, once a split has resolved.
    pub(super) const fn embedding(&self) -> Option<EmbeddingWorkload> {
        self.embedding
    }

    /// The classifier fit's folds, once it has announced them.
    pub(super) const fn classifier(&self) -> Option<ClassifierFolds> {
        self.classifier
    }

    /// The classifier fit's selected regularization strength, once chosen.
    pub(super) const fn classifier_regularization(&self) -> Option<f64> {
        self.classifier_regularization
    }

    /// The assembly's derived near-duplicate boundary, once derived.
    pub(super) const fn assembly_boundary(&self) -> Option<f64> {
        self.assembly_boundary
    }

    /// The neighbour-table construction's latest activity, once it has reported one.
    pub(super) const fn knn(&self) -> Option<&KnnActivity> {
        self.knn.as_ref()
    }

    /// The placement's training, once its first step has reported.
    pub(super) const fn projector(&self) -> Option<&ProjectorTraining> {
        self.projector.as_ref()
    }

    /// The placement's sampled rows, once a refresh tick has reported them.
    pub(super) const fn placement(&self) -> Option<&PlacementMap> {
        self.placement.as_ref()
    }

    /// The admission probe's readings, in [`QualityMetric::ALL`] order, skipping what it has not
    /// measured.
    ///
    /// Every reading arrives in one burst as the probe's report reduces its rungs, so the sequence
    /// is normally empty or whole; a short one is a battery whose evidence was absent for the
    /// missing controls.
    pub(super) fn quality(&self) -> impl Iterator<Item = (QualityMetric, f64)> + use<> {
        QualityMetric::ALL
            .into_iter()
            .zip(self.quality)
            .filter_map(|(metric, reading)| reading.map(|reading| (metric, reading)))
    }

    /// How many stages have completed.
    pub(super) fn completed_stages(&self) -> usize {
        self.completed.iter().filter(|slot| slot.is_some()).count()
    }

    /// The log tail, oldest first.
    pub(super) fn log(&self) -> impl ExactSizeIterator<Item = &str> {
        self.log.iter().map(String::as_str)
    }
}

#[cfg(test)]
mod tests;
