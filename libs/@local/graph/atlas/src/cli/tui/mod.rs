//! One fit's observations, drawn live in the terminal.
//!
//! [`Dashboard`] is the operator surface behind the shell's `--tui` flag. It owns the terminal and
//! a rendering thread. It hands the run an [`Observer`] to report into ([`Progress`]) and the log
//! subscriber a [`LogSink`] to write into. [`finish`](Dashboard::finish) restores the terminal
//! before the shell prints the fit's verdict.
//!
//! Reporting is one-way traffic. Observations and log lines travel down a channel as
//! [`Observation`]s, and the renderer owns the only [`RunState`], folding what has arrived into it
//! before each frame. A reporting thread parts with its observation and carries on, so a hot loop
//! never waits on the terminal.
//!
//! The dashboard observes and never steers, so nothing here can change what a run publishes. The
//! channel takes every observation as it comes. A closed channel means the dashboard has already
//! finished. No observation can fail a fit.
//!
//! One deliberate exception to that, because raw mode swallows the interrupt: `q` and `Ctrl-C`
//! restore the terminal and exit `130`. That reproduces what `Ctrl-C` does to a fit today - the
//! process dies mid-run and its staging directory survives on disk - rather than adding a
//! cancellation the pipeline does not have.

mod render;
mod state;

use alloc::sync::Arc;
use core::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use std::{
    io,
    process::ExitCode,
    sync::mpsc::{self, Receiver, Sender},
    thread::{self, JoinHandle},
};

use ratatui::{
    DefaultTerminal,
    crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers},
};
use tracing_subscriber::fmt::MakeWriter;

use self::state::{KnnActivity, Observation, RunState};
use crate::{
    math::Vec2,
    progress::{
        Batch, CardEmbeddingStats, DescentIteration, LossBreakdown, Progress, QualityMetric,
        RecallSpotCheck, Stage,
    },
};

/// How long the renderer waits for a key before drawing the next frame.
///
/// The spinner's cadence and the terminal's responsiveness are the same number: a keypress
/// short-circuits the wait, so the dashboard reacts at once and idles at ten frames a second.
const TICK: Duration = Duration::from_millis(100);

/// The exit code of an interrupted run, as a shell reports `SIGINT`.
const INTERRUPTED: u8 = 130;

/// Placement rows the dashboard asks the run to sample for its map.
///
/// Exactly what the widest map can hold apart, so the appetite is the frame's own resolution
/// rather than a number chosen to feel large enough.
const SNAPSHOT_ROWS: usize = render::MAP_CAPACITY;

/// The live dashboard for one fit.
///
/// A dashboard owns the terminal and the rendering thread that draws into it, plus the channel that
/// carries observations to that thread.
#[derive(Debug)]
pub(super) struct Dashboard {
    /// The sending half every reporter clones.
    observations: Sender<Observation>,
    /// Raised to bring the rendering thread home.
    ///
    /// A sending half outlives every run, since the shell installs the log subscriber globally and
    /// never drops it, so this flag is what ends the loop.
    stop: Arc<AtomicBool>,
    /// The rendering thread, which owns the terminal and restores it as it leaves.
    renderer: JoinHandle<io::Result<()>>,
}

impl Dashboard {
    /// Takes the terminal and starts drawing.
    ///
    /// # Errors
    ///
    /// Returns an [`io::Error`] when this cannot take the terminal or cannot spawn the rendering
    /// thread. Both happen before the run begins, so a failure here costs nothing.
    pub(super) fn start() -> io::Result<Self> {
        let terminal = ratatui::try_init()?;
        let (observations, arrived) = mpsc::channel();
        let stop = Arc::new(AtomicBool::new(false));

        let renderer = thread::Builder::new()
            .name("atlas-dashboard".to_owned())
            .spawn({
                let stop = Arc::clone(&stop);
                move || render(terminal, &arrived, &stop)
            })?;

        Ok(Self {
            observations,
            stop,
            renderer,
        })
    }

    /// The observer the run reports its progress to.
    pub(super) fn observer(&self) -> Observer {
        Observer {
            observations: self.observations.clone(),
        }
    }

    /// The writer the log subscriber renders records into.
    pub(super) fn log_sink(&self) -> LogSink {
        LogSink {
            observations: self.observations.clone(),
        }
    }

    /// Draws the last frame and restores the terminal, handing the shell its output back.
    ///
    /// # Errors
    ///
    /// Returns an [`io::Error`] when the final frame or the terminal restoration failed. This
    /// restores the terminal either way, because a panicking renderer has already run the hook
    /// [`ratatui::try_init`] installed.
    pub(super) fn finish(self) -> io::Result<()> {
        self.stop.store(true, Ordering::Release);

        self.renderer.join().unwrap_or_else(|_panicked| {
            // The hook `ratatui::try_init` installed has already restored the terminal; restoring
            // twice costs nothing and guarantees the shell prints onto a sane screen.
            ratatui::restore();
            Ok(())
        })
    }
}

/// The dashboard's observer, which sends every observation down the channel.
#[derive(Debug, Clone)]
pub(super) struct Observer {
    /// The renderer's end of the run's observations.
    observations: Sender<Observation>,
}

impl Observer {
    /// Reports one observation, dropping it once the dashboard has finished.
    ///
    /// A run may outlive the terminal an operator watched it on, and it publishes the same
    /// generation either way.
    fn report(&self, observation: Observation) {
        drop(self.observations.send(observation));
    }
}

impl Progress for Observer {
    /// A detached half reports into the same dashboard through the same channel.
    type Detached = Self;

    fn detach(&self) -> Self {
        self.clone()
    }

    fn embedding_started(&self, stats: &CardEmbeddingStats) {
        self.report(Observation::EmbeddingStarted(*stats));
    }

    fn embedding_batch(&self, batch: Batch) {
        self.report(Observation::EmbeddingBatch(batch));
    }

    fn assembly_boundary_derived(&self, epsilon: f64) {
        self.report(Observation::AssemblyBoundary(epsilon));
    }

    fn classifier_started(&self, folds: usize) {
        self.report(Observation::ClassifierStarted(folds));
    }

    fn classifier_fold_completed(&self, _fold: usize) {
        self.report(Observation::ClassifierFoldCompleted);
    }

    fn classifier_regularization_selected(&self, regularization: f64) {
        self.report(Observation::ClassifierRegularization(regularization));
    }

    fn knn_build_phase(&self, phase: &str) {
        self.report(Observation::Knn(KnnActivity::Building(phase.to_owned())));
    }

    fn knn_insert(&self, batch: Batch) {
        self.report(Observation::Knn(KnnActivity::Inserting(batch)));
    }

    fn descent_iteration(&self, iteration: DescentIteration) {
        self.report(Observation::Knn(KnnActivity::Descending(iteration)));
    }

    fn knn_readback(&self, batch: Batch) {
        self.report(Observation::Knn(KnnActivity::Reading(batch)));
    }

    fn knn_recall(&self, check: &RecallSpotCheck) {
        self.report(Observation::Knn(KnnActivity::Measured(*check)));
    }

    fn projector_step(&self, step: usize, steps: usize, loss: &LossBreakdown) {
        self.report(Observation::ProjectorStep {
            step,
            steps,
            loss: *loss,
        });
    }

    fn projector_sample_size(&self) -> usize {
        SNAPSHOT_ROWS
    }

    fn projector_snapshot(&self, positions: &[Vec2], landmarks: usize) {
        self.report(Observation::ProjectorSnapshot {
            positions: positions.to_vec(),
            landmarks,
        });
    }

    fn quality_probe(&self, metric: QualityMetric, value: f64) {
        self.report(Observation::QualityProbe {
            metric,
            reading: value,
        });
    }

    fn stage_completed(&self, stage: Stage) {
        self.report(Observation::StageCompleted(stage));
    }
}

/// The log destination that turns the subscriber's records into the log pane's lines.
#[derive(Debug, Clone)]
pub(super) struct LogSink {
    /// The renderer's end of the run's observations.
    observations: Sender<Observation>,
}

impl<'writer> MakeWriter<'writer> for LogSink {
    type Writer = LogWriter;

    fn make_writer(&'writer self) -> Self::Writer {
        LogWriter {
            observations: self.observations.clone(),
            pending: Vec::new(),
        }
    }
}

/// One record's worth of formatted log output on its way into the pane.
#[derive(Debug)]
pub(super) struct LogWriter {
    /// The renderer's end of the run's observations.
    observations: Sender<Observation>,
    /// Bytes written so far that do not yet end a line.
    pending: Vec<u8>,
}

impl io::Write for LogWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.pending.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        // The subscriber writes one record as a sequence of calls and ends it with a newline. Only
        // whole lines become rows of the pane.
        while let Some(end) = self.pending.iter().position(|&byte| byte == b'\n') {
            let line: Vec<u8> = self.pending.drain(..=end).collect();
            let line = String::from_utf8_lossy(&line[..end]).into_owned();
            drop(self.observations.send(Observation::Logged(line)));
        }

        Ok(())
    }
}

impl Drop for LogWriter {
    fn drop(&mut self) {
        // The subscriber drops the writer at the end of every record,
        // which is what makes the record appear.
        drop(io::Write::flush(self));
    }
}

/// Draws one frame of the model as it currently stands.
fn draw(terminal: &mut DefaultTerminal, state: &RunState, tick: usize) -> io::Result<()> {
    terminal.draw(|frame| render::frame(frame, state, tick))?;

    Ok(())
}

/// Folds every observation that has arrived into the model.
fn absorb(state: &mut RunState, arrived: &Receiver<Observation>) {
    for observation in arrived.try_iter() {
        state.absorb(observation);
    }
}

/// Restores the terminal and leaves, as the interrupt raw mode swallowed would have.
fn interrupt(terminal: DefaultTerminal) -> ! {
    drop(terminal);
    ratatui::restore();

    ExitCode::from(INTERRUPTED).exit_process()
}

/// Whether a terminal event is the operator asking to stop the run.
fn interrupted(event: &Event) -> bool {
    let Event::Key(KeyEvent {
        code,
        modifiers,
        kind: KeyEventKind::Press,
        ..
    }) = event
    else {
        return false;
    };

    *code == KeyCode::Char('q')
        || (*code == KeyCode::Char('c') && modifiers.contains(KeyModifiers::CONTROL))
}

/// Draws frames until the shell raises `stop`, then restores the terminal.
///
/// The model lives here, on the thread that draws it: each frame folds in what has arrived since
/// the last one.
fn render(
    mut terminal: DefaultTerminal,
    arrived: &Receiver<Observation>,
    stop: &AtomicBool,
) -> io::Result<()> {
    let mut state = RunState::new();
    let mut tick = 0_usize;

    while !stop.load(Ordering::Acquire) {
        absorb(&mut state, arrived);
        draw(&mut terminal, &state, tick)?;

        // The poll doubles as the frame clock, and the channel fills
        // while it waits.
        if event::poll(TICK)? && interrupted(&event::read()?) {
            interrupt(terminal);
        }

        tick = tick.wrapping_add(1);
    }

    // The finished rail is worth one last frame before the alternate
    // screen goes away, and what the run reported under the previous
    // one belongs in it.
    absorb(&mut state, arrived);
    draw(&mut terminal, &state, tick)?;
    drop(terminal);
    ratatui::try_restore()
}

#[cfg(test)]
mod tests {
    use std::{
        io::Write as _,
        sync::mpsc::{self, Receiver, Sender},
    };

    use tracing_subscriber::fmt::MakeWriter as _;

    use super::{LogSink, Observation, Observer, RunState, absorb};
    use crate::{
        math::Vec2,
        progress::{Progress as _, QualityMetric, Stage},
    };

    /// A reporter and the renderer's end of its channel.
    fn channel() -> (Sender<Observation>, Receiver<Observation>) {
        mpsc::channel()
    }

    /// The model the renderer would hold, from everything reported so far.
    fn absorbed(arrived: &Receiver<Observation>) -> RunState {
        let mut state = RunState::new();
        absorb(&mut state, arrived);

        state
    }

    /// The pane's lines, oldest first.
    fn lines(arrived: &Receiver<Observation>) -> Vec<String> {
        absorbed(arrived).log().map(str::to_owned).collect()
    }

    #[test]
    fn an_observation_lands_in_the_state_the_renderer_draws() {
        let (observations, arrived) = channel();
        let observer = Observer { observations };

        observer.stage_completed(Stage::Ingest);

        assert_eq!(absorbed(&arrived).completed_stages(), 1);
    }

    #[test]
    fn observations_are_folded_in_the_order_they_were_reported() {
        let (observations, arrived) = channel();
        let observer = Observer { observations };

        observer.classifier_started(5);
        observer.classifier_fold_completed(0);
        observer.classifier_fold_completed(1);

        // The model drops a fold that arrives before its announcement, so the counter reads the
        // arrival order rather than the set.
        let folds = absorbed(&arrived)
            .classifier()
            .expect("the announcement landed");
        assert_eq!(folds.total, 5);
        assert_eq!(folds.done, 2);
    }

    #[test]
    fn the_admission_batterys_readings_reach_the_state_the_renderer_draws() {
        let (observations, arrived) = channel();
        let observer = Observer { observations };

        // The runner reports every control that has a reading, in one
        // burst, immediately before the stage completes.
        observer.quality_probe(QualityMetric::Recall, 0.9021);
        observer.quality_probe(QualityMetric::Trustworthiness, 0.8712);
        observer.stage_completed(Stage::Admission);

        let state = absorbed(&arrived);
        assert_eq!(
            state.quality().collect::<Vec<_>>(),
            [
                (QualityMetric::Recall, 0.9021),
                (QualityMetric::Trustworthiness, 0.8712),
            ]
        );
        // The readings outlive the stage that reported them, and the
        // burst reaches the model in the same frame as the completion.
        assert_eq!(state.completed_stages(), 1);
    }

    #[test]
    fn a_run_outliving_its_dashboard_keeps_reporting_into_nothing() {
        let (observations, arrived) = channel();
        let observer = Observer { observations };
        drop(arrived);

        // The renderer has left; the run has not, and an observation may not fail it.
        observer.stage_completed(Stage::Seal);
    }

    #[test]
    fn the_dashboard_asks_for_a_sample_and_draws_what_comes_back() {
        let (observations, arrived) = channel();
        let observer = Observer { observations };

        // The appetite is what turns the map on at all: the trait's
        // default is zero, which leaves the run gathering nothing and
        // the pane empty forever.
        assert!(observer.projector_sample_size() > 0);

        observer.projector_snapshot(&[Vec2::new(1.0, 2.0), Vec2::new(3.0, 4.0)], 1);

        let state = absorbed(&arrived);
        let placement = state.placement().expect("the snapshot landed");
        assert_eq!(placement.positions.len(), 2);
        assert_eq!(placement.landmarks, 1);
    }

    #[test]
    fn log_records_become_pane_lines() {
        let (observations, arrived) = channel();
        let subscriber = tracing_subscriber::fmt()
            .with_writer(LogSink { observations })
            .with_ansi(false)
            .without_time()
            .finish();

        // The dispatcher is thread-local here on purpose, so the test exercises the writer rather
        // than the shell's global installation.
        tracing::subscriber::with_default(subscriber, || {
            tracing::info!(rows = 49, "staged the annotation corpus");
        });

        let lines = lines(&arrived);
        assert_eq!(lines.len(), 1, "{lines:?}");
        // The timeless formatter leads with a space, which the level
        // styling steps over and the pane's padding absorbs.
        assert!(lines[0].trim_start().starts_with("INFO"), "{lines:?}");
        assert!(
            lines[0].contains("staged the annotation corpus"),
            "{lines:?}"
        );
        assert!(lines[0].contains("rows=49"), "{lines:?}");
    }

    #[test]
    fn a_record_appears_only_once_its_line_is_whole() {
        let (observations, arrived) = channel();
        let sink = LogSink { observations };
        let mut writer = sink.make_writer();

        // The formatter writes one record as a sequence of calls, and a half record must not become
        // a row of the pane.
        writer
            .write_all(b"INFO the run is ")
            .expect("should accept bytes");
        writer.flush().expect("should flush");
        assert!(lines(&arrived).is_empty());

        writer
            .write_all(b"halfway\nWARN and then some\n")
            .expect("should accept bytes");
        writer.flush().expect("should flush");

        assert_eq!(
            lines(&arrived),
            [
                "INFO the run is halfway".to_owned(),
                "WARN and then some".to_owned(),
            ]
        );
    }
}
