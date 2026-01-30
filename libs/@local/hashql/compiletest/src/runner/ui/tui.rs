use core::time::Duration;
use std::{io, sync::mpsc, thread, time::Instant};

use ansi_to_tui::IntoText;
use error_stack::Report;
use ratatui::{
    Frame, Terminal, TerminalOptions,
    crossterm::event,
    layout::{Constraint, Direction, Layout},
    prelude::Backend,
    style::Color,
    symbols::Marker,
    widgets::{
        Block, Paragraph, Widget,
        canvas::{Canvas, Rectangle},
    },
};
use rayon::iter::{IndexedParallelIterator, IntoParallelRefIterator, ParallelIterator};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::harness::trial::{TrialContext, TrialError, TrialSet, TrialStatistics};

#[derive(Debug, Clone)]
enum Event {
    TracingMessage(Vec<u8>),

    TrialStarted(usize),
    TrialFinished(usize, bool, TrialStatistics),

    Shutdown,
    Tick,
    Resize,
}

#[derive(Debug, Clone)]
struct TracingWriter {
    sender: mpsc::Sender<Event>,
}

impl io::Write for TracingWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let len = buf.len();
        self.sender.send(Event::TracingMessage(buf.to_vec()));
        Ok(len)
    }

    fn write_all(&mut self, buf: &[u8]) -> io::Result<()> {
        self.write(buf).map(|_| ())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[derive(Debug, Clone)]
struct TuiConfig {
    tick_rate: Duration,
}

fn input_handler(tx: mpsc::Sender<Event>, TuiConfig { tick_rate }: TuiConfig) -> io::Result<()> {
    let mut last_tick = Instant::now();

    loop {
        // poll for tick rate duration, if no events, sent tick event.
        let timeout = tick_rate.saturating_sub(last_tick.elapsed());

        let poll = event::poll(timeout)?;
        if poll {
            match event::read()? {
                event::Event::Resize(_, _) => {
                    tx.send(Event::Resize).map_err(io::Error::other)?;
                }
                _ => {}
            }
        }

        if last_tick.elapsed() >= tick_rate {
            tx.send(Event::Tick).map_err(io::Error::other)?;
            last_tick = Instant::now();
        }
    }
}

enum TrialState {
    Pending,
    Running,
    Success(TrialStatistics),
    Failure(TrialStatistics),
}

struct RenderState<'trial, 'graph> {
    trials: TrialSet<'trial, 'graph>,
    results: Vec<TrialState>,
}
impl<'trial, 'graph> RenderState<'trial, 'graph> {
    fn new(set: &TrialSet<'trial, 'graph>) -> Self {
        Self {
            trials: set.clone(),
            results: Vec::from_fn(set.len(), |_| TrialState::Pending),
        }
    }
}

fn render(frame: &mut Frame, state: &mut RenderState) {
    let area = frame.area();

    let stats_height = 4_u16;

    let layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(4), Constraint::Length(stats_height)])
        .split(area);

    let grid_area = layout[0];
    let grid_ratio = grid_area.width.max(1) as f64 / grid_area.height.max(1) as f64;
    let total = state.results.len().max(1) as f64;
    let rows = (total / grid_ratio).sqrt().ceil().max(1.0) as u16;
    let cols = ((total / rows as f64).ceil()).max(1.0) as u16;

    let mut pending = 0;
    let mut running = 0;
    let mut success = 0;
    let mut failure = 0;

    for result in &state.results {
        match result {
            TrialState::Pending => pending += 1,
            TrialState::Running => running += 1,
            TrialState::Success(_) => success += 1,
            TrialState::Failure(_) => failure += 1,
        }
    }

    let canvas = Canvas::default()
        .block(Block::bordered().title(format!(
            "Pending: {pending} Running: {running} Success: {success} Failure: {failure}"
        )))
        .marker(Marker::Octant)
        .x_bounds([0.0, rows as f64])
        .y_bounds([0.0, cols as f64])
        .paint(|ctx| {
            for (index, result) in state.results.iter().enumerate() {
                let index = index as u16;

                let row = index / cols;
                let col = index % cols;

                ctx.draw(&Rectangle::new(
                    row as f64,
                    col as f64,
                    1.0,
                    1.0,
                    match result {
                        TrialState::Pending => Color::Gray,
                        TrialState::Running => Color::Yellow,
                        TrialState::Success(_) => Color::Green,
                        TrialState::Failure(_) => Color::Red,
                    },
                ));
            }
        });

    frame.render_widget(canvas, grid_area);

    let mut totals = TrialStatistics::default();
    let mut stats_count = 0_usize;

    for result in &state.results {
        if let TrialState::Success(stats) = result {
            stats_count += 1;
            totals.files_read += stats.files_read;
            totals.bytes_read += stats.bytes_read;
            totals.files_written += stats.files_written;
            totals.bytes_written += stats.bytes_written;
            totals.files_removed += stats.files_removed;
            totals.run += stats.run;
            totals.assert += stats.assert;
            totals.verify += stats.verify;
            totals.read_source += stats.read_source;
            totals.parse += stats.parse;
            totals.render_stderr += stats.render_stderr;
        }
    }

    let average = |duration: Duration, count: usize| -> Duration {
        if count == 0 {
            Duration::ZERO
        } else {
            let nanos = duration.as_nanos() / count as u128;
            Duration::from_nanos(nanos as u64)
        }
    };

    let format_duration = |duration: Duration| -> String {
        let seconds = duration.as_secs_f64();
        if seconds >= 1.0 {
            format!("{seconds:.2}s")
        } else {
            format!("{:.1}ms", seconds * 1000.0)
        }
    };

    let read_kib = totals.bytes_read as f64 / 1024.0;
    let written_kib = totals.bytes_written as f64 / 1024.0;
    let io_line = format!(
        "I/O\nread {} files ({read_kib:.1} KiB) wrote {} files ({written_kib:.1} KiB) removed {}",
        totals.files_read, totals.files_written, totals.files_removed
    );

    let avg_read_source = average(totals.read_source, stats_count);
    let avg_parse = average(totals.parse, stats_count);
    let avg_run = average(totals.run, stats_count);
    let avg_assert = average(totals.assert, stats_count);
    let avg_verify = average(totals.verify, stats_count);
    let avg_render_stderr = average(totals.render_stderr, stats_count);
    let avg_total = average(
        totals.run
            + totals.assert
            + totals.verify
            + totals.read_source
            + totals.parse
            + totals.render_stderr,
        stats_count,
    );

    let timing_line = if stats_count == 0 {
        "Timing\nwaiting for completed trials".to_string()
    } else {
        format!(
            "Timing avg/{stats_count}\nread {} parse {} run {} assert {} verify {} stderr {} \
             total {}",
            format_duration(avg_read_source),
            format_duration(avg_parse),
            format_duration(avg_run),
            format_duration(avg_assert),
            format_duration(avg_verify),
            format_duration(avg_render_stderr),
            format_duration(avg_total)
        )
    };

    let stats_area = layout[1];
    let stats_block = Block::bordered().title("Statistics");
    let stats_inner = stats_block.inner(stats_area);
    frame.render_widget(stats_block, stats_area);

    let stats_columns = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .split(stats_inner);

    frame.render_widget(Paragraph::new(io_line), stats_columns[0]);
    frame.render_widget(Paragraph::new(timing_line), stats_columns[1]);
}

fn event_loop<B: Backend>(
    mut terminal: Terminal<B>,
    mut state: RenderState,
    rx: mpsc::Receiver<Event>,
) -> Result<Terminal<B>, B::Error> {
    let mut redraw = true;

    loop {
        if redraw {
            terminal.draw(|frame| render(frame, &mut state))?;
        }
        redraw = true;

        let event = rx
            .recv()
            .expect("receivers should be dropped before sender");

        match event {
            Event::TracingMessage(bytes) => {
                let size = terminal.size()?;
                let paragraph =
                    Paragraph::new(bytes.into_text().expect("bytes must be valid ANSI"));
                let height = paragraph.line_count(size.height);

                terminal.insert_before(height as u16, |buffer| {
                    paragraph.render(buffer.area, buffer);
                })?;
            }
            Event::Resize => terminal.autoresize()?,
            Event::Tick => {}
            Event::Shutdown => return Ok(terminal),

            Event::TrialStarted(index) => {
                state.results[index] = TrialState::Running;
                redraw = false;
            }
            Event::TrialFinished(index, success, trial_stats) => {
                let next = if success {
                    TrialState::Success(trial_stats)
                } else {
                    TrialState::Failure(trial_stats)
                };

                state.results[index] = next;
                redraw = false;
            }
        }
    }
}

fn run_trials(
    set: &TrialSet,
    context: &TrialContext,
    sender: mpsc::Sender<Event>,
) -> Vec<Report<[TrialError]>> {
    let reports = set.trials
        .par_iter()
        .enumerate()
        .map(|(index, (group, trial))| {
            sender
                .send(Event::TrialStarted(index))
                .expect("should be able to send message");


            tracing::debug!(group = group.metadata.name(), trial = ?trial.namespace, "running trial");
            let (stats, result) = trial.run_catch(&group.metadata, context);
            sender
                .send(Event::TrialFinished(index, result.is_ok(), stats))
                .expect("should be able to send message");
            tracing::debug!(group = group.metadata.name(), trial = ?trial.namespace, result = ?result, "finished trial");

            result
        })
        .filter_map(Result::err)
        .collect();

    tracing::info!("finished trial execution");
    reports
}

pub(crate) fn run(set: &TrialSet, context: &TrialContext) -> Vec<Report<[TrialError]>> {
    let (tx, rx) = mpsc::channel();

    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().with_writer({
            let writer = TracingWriter { sender: tx.clone() };

            move || writer.clone()
        }))
        .init();

    let terminal = ratatui::init_with_options(TerminalOptions {
        viewport: ratatui::Viewport::Inline(16),
    });

    let (reports, terminal) = thread::scope(|scope| {
        scope.spawn({
            let tx = tx.clone();

            move || {
                input_handler(
                    tx,
                    TuiConfig {
                        tick_rate: Duration::from_millis(200),
                    },
                )
            }
        });

        let state = RenderState::new(set);
        let handle = scope.spawn(move || event_loop(terminal, state, rx));

        let reports = run_trials(set, context, tx.clone());
        tx.send(Event::Shutdown)
            .expect("should be able to send shutdown");
        let terminal = handle.join().expect("should be able to join handle");

        (reports, terminal)
    });

    ratatui::restore();
    reports
}
