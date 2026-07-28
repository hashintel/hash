//! The live dashboard: one fit's observations, drawn.
//!
//! [`Dashboard`] is the operator surface behind the shell's `--tui` flag. It owns the terminal and
//! a rendering thread, hands the run an [`Observer`] to report into ([`Progress`]) and the log
//! subscriber a [`LogSink`] to write into, and restores the terminal at
//! [`finish`](Dashboard::finish) before the shell prints the fit's verdict. The three pieces share
//! one [`RunState`] behind a mutex: observations and log lines land in it, the renderer reads it at
//! tick cadence, and the lock is held only across a draw so a reporting hot loop never waits on the
//! terminal.
//!
//! The dashboard observes and never steers, so nothing here can change what a run publishes: a
//! poisoned mutex is read through rather than unwrapped, and no observation can fail a fit.
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
    sync::{Mutex, MutexGuard, PoisonError},
    thread::{self, JoinHandle},
};

use ratatui::{
    DefaultTerminal,
    crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers},
};
use tracing_subscriber::fmt::MakeWriter;

use self::state::RunState;
use crate::{
    math::Vec2,
    progress::{Batch, CardEmbeddingStats, LossBreakdown, Progress, Stage},
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

/// Reads shared state, treating a poisoned mutex as readable.
///
/// A panicking observer must not take the run down with it, and every writer here leaves the state
/// structurally intact: the worst a poisoned lock can hold is a frame's worth of stale progress.
fn read<T>(state: &Mutex<T>) -> MutexGuard<'_, T> {
    state.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The live dashboard: a terminal, a rendering thread, and the state they share.
#[derive(Debug)]
pub(super) struct Dashboard {
    /// The model every piece shares.
    state: Arc<Mutex<RunState>>,
    /// Raised to bring the rendering thread home.
    stop: Arc<AtomicBool>,
    /// The rendering thread, which owns the terminal and restores it as it leaves.
    renderer: JoinHandle<io::Result<()>>,
}

impl Dashboard {
    /// Takes the terminal and starts drawing.
    ///
    /// # Errors
    ///
    /// Returns an [`io::Error`] when the terminal cannot be prepared or the rendering thread cannot
    /// be spawned - both before the run begins, so a failure here costs nothing.
    pub(super) fn start() -> io::Result<Self> {
        let terminal = ratatui::try_init()?;
        let state = Arc::new(Mutex::new(RunState::new()));
        let stop = Arc::new(AtomicBool::new(false));

        let renderer = thread::Builder::new()
            .name("atlas-dashboard".to_owned())
            .spawn({
                let state = Arc::clone(&state);
                let stop = Arc::clone(&stop);
                move || render(terminal, &state, &stop)
            })?;

        Ok(Self {
            state,
            stop,
            renderer,
        })
    }

    /// The observer the run reports its progress to.
    pub(super) fn observer(&self) -> Observer {
        Observer {
            state: Arc::clone(&self.state),
        }
    }

    /// The writer the log subscriber renders records into.
    pub(super) fn log_sink(&self) -> LogSink {
        LogSink {
            state: Arc::clone(&self.state),
        }
    }

    /// Draws the last frame, restores the terminal, and gives the shell its output back.
    ///
    /// # Errors
    ///
    /// Returns an [`io::Error`] when the final frame or the terminal restoration failed. The
    /// terminal is restored either way: a panicking renderer has already run the hook
    /// [`ratatui::try_init`] installed.
    pub(super) fn finish(self) -> io::Result<()> {
        self.stop.store(true, Ordering::Release);

        self.renderer.join().unwrap_or_else(|_panicked| {
            // The hook `ratatui::try_init` installed has already restored
            // the terminal; restoring twice costs nothing and guarantees
            // the shell prints onto a sane screen.
            ratatui::restore();
            Ok(())
        })
    }
}

/// The dashboard's observer: every observation lands in the shared state.
#[derive(Debug, Clone)]
pub(super) struct Observer {
    /// The model the renderer draws.
    state: Arc<Mutex<RunState>>,
}

impl Progress for Observer {
    fn embedding_started(&self, stats: &CardEmbeddingStats) {
        read(&self.state).start_embedding(stats);
    }

    fn embedding_batch(&self, batch: Batch) {
        read(&self.state).advance_embedding(batch);
    }

    fn classifier_started(&self, folds: usize) {
        read(&self.state).start_classifier(folds);
    }

    fn classifier_fold_completed(&self, _fold: usize) {
        read(&self.state).complete_classifier_fold();
    }

    fn projector_step(&self, step: usize, steps: usize, loss: &LossBreakdown) {
        read(&self.state).advance_projector(step, steps, loss);
    }

    fn projector_sample_size(&self) -> usize {
        SNAPSHOT_ROWS
    }

    fn projector_snapshot(&self, positions: &[Vec2], landmarks: usize) {
        read(&self.state).place_projector(positions, landmarks);
    }

    fn stage_completed(&self, stage: Stage) {
        read(&self.state).complete(stage);
    }
}

/// The dashboard's log destination: the subscriber's records become the log pane's lines.
#[derive(Debug, Clone)]
pub(super) struct LogSink {
    /// The model the renderer draws.
    state: Arc<Mutex<RunState>>,
}

impl<'writer> MakeWriter<'writer> for LogSink {
    type Writer = LogWriter;

    fn make_writer(&'writer self) -> Self::Writer {
        LogWriter {
            state: Arc::clone(&self.state),
            pending: Vec::new(),
        }
    }
}

/// One record's worth of formatted log output on its way into the pane.
#[derive(Debug)]
pub(super) struct LogWriter {
    /// The model the renderer draws.
    state: Arc<Mutex<RunState>>,
    /// Bytes written so far that do not yet end a line.
    pending: Vec<u8>,
}

impl io::Write for LogWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.pending.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        // The subscriber writes one record as several calls and ends it
        // with a newline; only whole lines become rows of the pane.
        let mut lines = Vec::new();
        while let Some(end) = self.pending.iter().position(|&byte| byte == b'\n') {
            let line: Vec<u8> = self.pending.drain(..=end).collect();
            lines.push(String::from_utf8_lossy(&line[..end]).into_owned());
        }

        if lines.is_empty() {
            return Ok(());
        }

        // The lock is taken after the parsing and released before the
        // return: a logging thread must not wait on a frame.
        {
            let mut state = read(&self.state);
            for line in lines {
                state.push_log(line);
            }
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

/// Draws one frame, holding the state's lock only for the draw itself.
fn draw(terminal: &mut DefaultTerminal, state: &Mutex<RunState>, tick: usize) -> io::Result<()> {
    let snapshot = read(state);
    terminal.draw(|frame| render::frame(frame, &snapshot, tick))?;

    Ok(())
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
fn render(
    mut terminal: DefaultTerminal,
    state: &Mutex<RunState>,
    stop: &AtomicBool,
) -> io::Result<()> {
    let mut tick = 0_usize;

    while !stop.load(Ordering::Acquire) {
        draw(&mut terminal, state, tick)?;

        // The poll doubles as the frame clock; the lock is free while
        // it waits, so the run reports into the state unobstructed.
        if event::poll(TICK)? && interrupted(&event::read()?) {
            interrupt(terminal);
        }

        tick = tick.wrapping_add(1);
    }

    // The finished rail is worth one last frame before the alternate
    // screen goes away.
    draw(&mut terminal, state, tick)?;
    drop(terminal);
    ratatui::try_restore()
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use std::{io::Write as _, sync::Mutex};

    use tracing_subscriber::fmt::MakeWriter as _;

    use super::{LogSink, Observer, RunState, read};
    use crate::{
        math::Vec2,
        progress::{Progress as _, Stage},
    };

    /// The pane's lines, oldest first.
    fn lines(state: &Mutex<RunState>) -> Vec<String> {
        read(state).log().map(str::to_owned).collect()
    }

    #[test]
    fn an_observation_lands_in_the_state_the_renderer_draws() {
        let state = Arc::new(Mutex::new(RunState::new()));
        let observer = Observer {
            state: Arc::clone(&state),
        };

        observer.stage_completed(Stage::Ingest);

        assert_eq!(read(&state).completed_stages(), 1);
    }

    #[test]
    fn the_dashboard_asks_for_a_sample_and_draws_what_comes_back() {
        let state = Arc::new(Mutex::new(RunState::new()));
        let observer = Observer {
            state: Arc::clone(&state),
        };

        // The appetite is what turns the map on at all: the trait's
        // default is zero, which leaves the run gathering nothing and
        // the pane empty forever.
        assert!(observer.projector_sample_size() > 0);

        observer.projector_snapshot(&[Vec2::new(1.0, 2.0), Vec2::new(3.0, 4.0)], 1);

        let placement = read(&state)
            .placement()
            .cloned()
            .expect("the snapshot landed");
        assert_eq!(placement.positions.len(), 2);
        assert_eq!(placement.landmarks, 1);
    }

    #[test]
    fn log_records_become_pane_lines() {
        let state = Arc::new(Mutex::new(RunState::new()));
        let subscriber = tracing_subscriber::fmt()
            .with_writer(LogSink {
                state: Arc::clone(&state),
            })
            .with_ansi(false)
            .without_time()
            .finish();

        // The dispatcher is thread-local here on purpose: the test
        // exercises the writer, not the shell's global installation.
        tracing::subscriber::with_default(subscriber, || {
            tracing::info!(rows = 49, "staged the annotation corpus");
        });

        let lines = lines(&state);
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
        let state = Arc::new(Mutex::new(RunState::new()));
        let sink = LogSink {
            state: Arc::clone(&state),
        };
        let mut writer = sink.make_writer();

        // The formatter writes one record as several calls; a half
        // record must not become a row of the pane.
        writer
            .write_all(b"INFO the run is ")
            .expect("should accept bytes");
        writer.flush().expect("should flush");
        assert!(lines(&state).is_empty());

        writer
            .write_all(b"halfway\nWARN and then some\n")
            .expect("should accept bytes");
        writer.flush().expect("should flush");

        assert_eq!(
            lines(&state),
            [
                "INFO the run is halfway".to_owned(),
                "WARN and then some".to_owned(),
            ]
        );
    }
}
