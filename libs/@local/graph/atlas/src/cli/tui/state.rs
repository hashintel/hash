//! The dashboard's model of one run: stage progression, the embedding workload, the projector's
//! loss curve and placement, and the log tail.
//!
//! [`RunState`] absorbs [`Observation`]s and answers the questions the renderer asks - what is each
//! stage doing, how far the paid embedding has come, how the placement is descending, where its
//! rows currently sit, and what the run has said lately. It holds no terminal, no channel, and no
//! clock beyond the run's start, so the whole reduction is exercisable without drawing anything.

use alloc::collections::VecDeque;
use core::time::Duration;
use std::time::Instant;

use crate::{
    math::Vec2,
    progress::{
        Batch, CardEmbeddingStats, DescentIteration, LossBreakdown, RecallSpotCheck, Stage,
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

/// One card-embedding workload: the split that sized it, and what the provider has returned.
///
/// `reused` and `embedded` partition the run's distinct card texts; `done` counts the `embedded`
/// share that has come back, so a workload wholly served from the prior generation is complete at
/// `embedded == 0`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct EmbeddingWorkload {
    /// Unique texts the prior generation covered.
    pub reused: usize,
    /// Unique texts the provider was handed.
    pub embedded: usize,
    /// Texts of the provider's share that have come back.
    pub done: usize,
}

/// Training steps the loss curve keeps.
///
/// A schedule is a few thousand steps, so the whole curve normally fits and the chart shows the
/// run's entire descent; a longer schedule scrolls, oldest first, rather than growing the model.
const LOSS_CAPACITY: usize = 4_096;

/// One classifier fit's cross-validation folds: how many there are, and how many have landed.
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

/// One placement training run: how far it has come, and the loss curve it has drawn.
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
/// A construction runs one part at a time and always in this order - every row into the search
/// backend, the backend's own linking (or NN-Descent's iterations, which need no backend), every
/// row's list back out, then the recall verdict - so each observation replaces the last instead of
/// accumulating. The model carries the construction's newest word, which is what the stage is
/// doing.
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

/// One placement snapshot: where the sampled corpus rows sit right now.
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

/// One thing the run reported: a progress observation, or a line it logged.
///
/// This is the model's whole input vocabulary. Each variant carries what one [`Progress`] method
/// was handed, owned, so a reporting thread parts with it and never waits on the renderer - except
/// [`Knn`](Self::Knn), where one stage's five observations arrive as the one activity vocabulary
/// they fold into.
///
/// [`Progress`]: crate::progress::Progress
#[derive(Debug)]
pub(super) enum Observation {
    /// A card-embedding workload resolved its reuse split.
    EmbeddingStarted(CardEmbeddingStats),
    /// The provider returned another embedding chunk.
    EmbeddingBatch(Batch),
    /// The classifier fit announced its cross-validation folds.
    ClassifierStarted(usize),
    /// One cross-validation fold landed.
    ClassifierFoldCompleted,
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
    /// The classifier fit's folds, once it announces them.
    classifier: Option<ClassifierFolds>,
    /// The neighbour-table construction's latest activity, once it reports one.
    knn: Option<KnnActivity>,
    /// The placement's training, once its first step reports.
    projector: Option<ProjectorTraining>,
    /// The placement's sampled rows, once a refresh tick reports them.
    placement: Option<PlacementMap>,
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
            classifier: None,
            knn: None,
            projector: None,
            placement: None,
            log: VecDeque::with_capacity(LOG_CAPACITY),
        }
    }

    /// Folds one observation into the model.
    pub(super) fn absorb(&mut self, observation: Observation) {
        match observation {
            Observation::EmbeddingStarted(stats) => self.start_embedding(&stats),
            Observation::EmbeddingBatch(batch) => self.advance_embedding(batch),
            Observation::ClassifierStarted(folds) => self.start_classifier(folds),
            Observation::ClassifierFoldCompleted => self.complete_classifier_fold(),
            Observation::Knn(activity) => self.report_knn(activity),
            Observation::ProjectorStep { step, steps, loss } => {
                self.advance_projector(step, steps, &loss);
            }
            Observation::ProjectorSnapshot {
                positions,
                landmarks,
            } => self.place_projector(positions, landmarks),
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
    /// A batch without a split is dropped rather than guessed at: the provider's count describes
    /// its own workload, and nothing here may invent the reuse the split reported.
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
    /// A completion without an announced fold count is dropped rather than guessed at: only the
    /// fit knows how many folds it will run.
    pub(super) const fn complete_classifier_fold(&mut self) {
        let Some(folds) = self.classifier.as_mut() else {
            return;
        };

        folds.done = folds.done.saturating_add(1);
    }

    /// Records what the neighbour-table construction is doing now.
    ///
    /// Each activity replaces the last: the construction's loops, phases and verdict happen in one
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

    /// Replaces the placement map with the rows a refresh tick just reported.
    ///
    /// A landmark count past the reported rows is clamped rather than trusted: the map draws the
    /// skeleton out of the prefix, and a renderer must not slice past what it was handed.
    pub(super) fn place_projector(&mut self, positions: Vec<Vec2>, landmarks: usize) {
        self.placement = Some(PlacementMap {
            landmarks: landmarks.min(positions.len()),
            positions,
        });
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
    /// completion. So the rail's numbers always sum to the wall clock.
    pub(super) fn status(&self, index: usize, elapsed: Duration) -> StageStatus {
        let previous = index
            .checked_sub(1)
            .and_then(|earlier| self.completed[earlier])
            .unwrap_or_default();

        if let Some(completion) = self.completed[index] {
            return StageStatus::Done(completion.saturating_sub(previous));
        }

        // The run is inside the first stage that has not reported, and
        // every stage behind that one is unreached.
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
mod tests {
    use core::time::Duration;

    use super::{
        ClassifierFolds, EmbeddingWorkload, KnnActivity, LOG_CAPACITY, LOSS_CAPACITY, PlacementMap,
        RunState, StageStatus,
    };
    use crate::{
        math::Vec2,
        progress::{Batch, CardEmbeddingStats, LossBreakdown, RecallSpotCheck, Stage},
    };

    /// A spot check whose aggregate recall is `recall`, over ten thousand compared neighbours.
    fn check(recall: f64) -> RecallSpotCheck {
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "the fixture's recall is chosen to scale to a whole match count"
        )]
        let matched = (recall * 10_000.0).round() as u64;

        RecallSpotCheck {
            sampled_rows: 200,
            neighbours_per_row: 50,
            matched,
            expected: 10_000,
            deviation: 0.289,
            minimum_recall: 0.89,
            // z(0.99) · 0.289 / sqrt(200), the resolution such a sample
            // reaches.
            resolution: 0.0475,
            confidence: 0.99,
        }
    }

    /// A breakdown whose composite total is `total`, carried by its semantic term.
    fn loss(total: f32) -> LossBreakdown {
        LossBreakdown {
            semantic: total,
            ..LossBreakdown::default()
        }
    }

    /// Seconds as a duration, for readable expectations.
    fn secs(seconds: u64) -> Duration {
        Duration::from_secs(seconds)
    }

    #[test]
    fn a_fresh_run_is_inside_its_first_stage() {
        let state = RunState::new();

        assert_eq!(state.status(0, secs(3)), StageStatus::Running(secs(3)));
        assert_eq!(state.status(1, secs(3)), StageStatus::Pending);
        assert_eq!(state.completed_stages(), 0);
    }

    #[test]
    fn spans_are_differences_between_completions() {
        let mut state = RunState::new();
        state.complete_at(Stage::Ingest, secs(10));
        state.complete_at(Stage::Classifier, secs(25));

        // Ingest carries the run's opening ten seconds, the
        // classifier the fifteen after it, and the policy stage the
        // five since the last completion.
        assert_eq!(state.status(0, secs(30)), StageStatus::Done(secs(10)));
        assert_eq!(state.status(1, secs(30)), StageStatus::Done(secs(15)));
        assert_eq!(state.status(2, secs(30)), StageStatus::Running(secs(5)));
        assert_eq!(state.status(3, secs(30)), StageStatus::Pending);
        assert_eq!(state.completed_stages(), 2);
    }

    #[test]
    fn the_running_span_grows_with_the_clock() {
        let mut state = RunState::new();
        state.complete_at(Stage::Ingest, secs(10));

        assert_eq!(state.status(1, secs(12)), StageStatus::Running(secs(2)));
        assert_eq!(state.status(1, secs(70)), StageStatus::Running(secs(60)));
    }

    #[test]
    fn a_split_opens_the_counter_and_requests_advance_it() {
        let mut state = RunState::new();
        assert_eq!(state.embedding(), None);

        state.start_embedding(&CardEmbeddingStats {
            reused: 900,
            embedded: 100,
        });
        assert_eq!(
            state.embedding(),
            Some(EmbeddingWorkload {
                reused: 900,
                embedded: 100,
                done: 0,
            })
        );

        state.advance_embedding(Batch {
            done: 64,
            total: 100,
        });
        assert_eq!(
            state.embedding(),
            Some(EmbeddingWorkload {
                reused: 900,
                embedded: 100,
                done: 64,
            })
        );
    }

    #[test]
    fn a_second_workload_replaces_the_first() {
        let mut state = RunState::new();
        state.start_embedding(&CardEmbeddingStats {
            reused: 0,
            embedded: 49,
        });
        state.advance_embedding(Batch {
            done: 49,
            total: 49,
        });

        // The corpus finished; the cards are their own workload and the
        // counter must not carry the corpus's progress into them.
        state.start_embedding(&CardEmbeddingStats {
            reused: 12,
            embedded: 8,
        });

        assert_eq!(
            state.embedding(),
            Some(EmbeddingWorkload {
                reused: 12,
                embedded: 8,
                done: 0,
            })
        );
    }

    #[test]
    fn an_announced_fold_count_opens_the_counter_and_completions_advance_it() {
        let mut state = RunState::new();
        assert_eq!(state.classifier(), None);

        state.start_classifier(5);
        state.complete_classifier_fold();
        state.complete_classifier_fold();

        assert_eq!(
            state.classifier(),
            Some(ClassifierFolds { total: 5, done: 2 })
        );
    }

    #[test]
    fn a_fold_completion_without_an_announced_count_is_dropped() {
        let mut state = RunState::new();
        state.complete_classifier_fold();

        assert_eq!(state.classifier(), None);
    }

    #[test]
    fn each_construction_activity_replaces_the_one_before_it() {
        let mut state = RunState::new();
        assert_eq!(state.knn(), None);

        // The construction's own order: rows in, the backend's linking,
        // rows out, then the verdict.
        state.report_knn(KnnActivity::Inserting(Batch {
            done: 4_096,
            total: 9_000,
        }));
        state.report_knn(KnnActivity::Building("building the graph".to_owned()));
        state.report_knn(KnnActivity::Reading(Batch {
            done: 9_000,
            total: 9_000,
        }));

        assert_eq!(
            state.knn(),
            Some(&KnnActivity::Reading(Batch {
                done: 9_000,
                total: 9_000,
            })),
        );

        state.report_knn(KnnActivity::Measured(check(0.9021)));

        assert_eq!(state.knn(), Some(&KnnActivity::Measured(check(0.9021))));
    }

    #[test]
    fn the_first_training_step_opens_the_curve_and_the_rest_extend_it() {
        let mut state = RunState::new();
        assert_eq!(state.projector(), None);

        for step in 0..4 {
            #[expect(
                clippy::cast_precision_loss,
                reason = "four fixture steps are exactly representable"
            )]
            state.advance_projector(step, 300, &loss(8.0 - step as f32));
        }

        let training = state.projector().expect("four steps opened the curve");
        assert_eq!(training.steps, 300);
        // Steps are zero-based; the fourth one reports index three.
        assert_eq!(training.done, 4);
        assert_eq!(training.losses, [8.0, 7.0, 6.0, 5.0]);
        assert_eq!(training.last, loss(5.0));
    }

    #[expect(
        clippy::cast_precision_loss,
        reason = "the fixture's step count is exactly representable"
    )]
    #[test]
    fn the_curve_scrolls_rather_than_growing_without_limit() {
        let mut state = RunState::new();
        let steps = LOSS_CAPACITY + 2;
        for step in 0..steps {
            state.advance_projector(step, steps, &loss(step as f32));
        }

        let training = state.projector().expect("the curve opened");
        assert_eq!(training.losses.len(), LOSS_CAPACITY);
        // Two steps past the window, so the two oldest losses are the
        // ones that left: the window holds steps two onward.
        assert_eq!(training.losses.front(), Some(&2.0));
        assert_eq!(training.losses.back(), Some(&(steps as f32 - 1.0)));
        assert_eq!(training.done, steps);
    }

    #[test]
    fn a_second_training_run_does_not_inherit_the_first_curve() {
        let mut state = RunState::new();
        state.advance_projector(0, 300, &loss(8.0));
        state.advance_projector(1, 300, &loss(7.0));

        state.advance_projector(0, 120, &loss(4.0));

        let training = state.projector().expect("the second run opened its curve");
        assert_eq!(training.steps, 120);
        assert_eq!(training.done, 1);
        assert_eq!(training.losses, [4.0]);
    }

    #[test]
    fn a_snapshot_replaces_the_one_before_it() {
        let mut state = RunState::new();
        assert_eq!(state.placement(), None);

        state.place_projector(vec![Vec2::new(0.0, 0.0), Vec2::new(1.0, 1.0)], 1);
        state.place_projector(vec![Vec2::new(2.0, 2.0), Vec2::new(3.0, 3.0)], 1);

        // The map says where the placement is, not where it has been.
        assert_eq!(
            state.placement(),
            Some(&PlacementMap {
                positions: vec![Vec2::new(2.0, 2.0), Vec2::new(3.0, 3.0)],
                landmarks: 1,
            })
        );
    }

    #[test]
    fn a_landmark_count_past_the_reported_rows_is_clamped() {
        let mut state = RunState::new();
        state.place_projector(vec![Vec2::new(0.0, 0.0)], 9);

        // The renderer splits the prefix off; a count past the rows it
        // was handed would slice past the end of them.
        let placement = state.placement().expect("the snapshot opened the map");
        assert_eq!(placement.landmarks, 1);
    }

    #[test]
    fn a_request_without_a_split_is_dropped() {
        let mut state = RunState::new();
        state.advance_embedding(Batch { done: 2, total: 5 });

        assert_eq!(state.embedding(), None);
    }

    #[test]
    fn the_log_tail_evicts_its_oldest_line() {
        let mut state = RunState::new();
        for line in 0..=LOG_CAPACITY {
            state.push_log(format!("line {line}"));
        }

        assert_eq!(state.log().len(), LOG_CAPACITY);
        assert_eq!(state.log().next(), Some("line 1"));
        assert_eq!(
            state.log().last(),
            Some(format!("line {LOG_CAPACITY}").as_str())
        );
    }
}
