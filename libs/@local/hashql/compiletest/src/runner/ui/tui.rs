use core::{iter, time::Duration};
use std::{io, sync::mpsc, thread, time::Instant};

use ansi_to_tui::IntoText;
use error_stack::Report;
use ratatui::{
    Frame, Terminal, TerminalOptions,
    crossterm::event,
    layout::{Constraint, Direction, Layout, Rect},
    prelude::Backend,
    style::{Color, Style, Stylize},
    symbols::Marker,
    text::{Line, Span},
    widgets::{
        Block, Paragraph, Widget,
        canvas::{Canvas, Points},
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

fn format_duration(duration: Duration) -> String {
    let seconds = duration.as_secs_f64();
    if seconds >= 1.0 {
        format!("{seconds:.2}s")
    } else {
        format!("{:.1}ms", seconds * 1000.0)
    }
}

fn average(duration: Duration, count: usize) -> Duration {
    if count == 0 {
        Duration::ZERO
    } else {
        let nanos = duration.as_nanos() / count as u128;
        Duration::from_nanos(nanos as u64)
    }
}

fn render_grid(frame: &mut Frame, area: Rect, state: &RenderState) {
    let total = state.results.len().max(1);

    // Calculate grid dimensions based on aspect ratio
    // Each terminal cell is roughly 2x taller than wide, so adjust ratio
    let cell_aspect = 2.0;
    let area_ratio = (area.width as f64 * cell_aspect) / area.height.max(1) as f64;

    // rows * cols >= total, with cols/rows ≈ area_ratio
    let rows = ((total as f64 / area_ratio).sqrt().ceil() as usize).max(1);
    let cols = ((total + rows - 1) / rows).max(1);

    let mut pending = 0_usize;
    let mut running = 0_usize;
    let mut success = 0_usize;
    let mut failure = 0_usize;

    for result in &state.results {
        match result {
            TrialState::Pending => pending += 1,
            TrialState::Running => running += 1,
            TrialState::Success(_) => success += 1,
            TrialState::Failure(_) => failure += 1,
        }
    }

    let title = Line::from(vec![
        Span::raw(" "),
        Span::styled(format!("{pending}"), Style::new().gray()),
        Span::raw(" pending  "),
        Span::styled(format!("{running}"), Style::new().yellow()),
        Span::raw(" running  "),
        Span::styled(format!("{success}"), Style::new().green()),
        Span::raw(" passed  "),
        Span::styled(format!("{failure}"), Style::new().red()),
        Span::raw(" failed "),
    ]);

    // Group results by color for efficient drawing
    let mut pending_coords = Vec::new();
    let mut running_coords = Vec::new();
    let mut success_coords = Vec::new();
    let mut failure_coords = Vec::new();

    // Generate multiple points per cell for better fill density
    let subdivisions = 4;
    let step = 1.0 / subdivisions as f64;

    for (index, result) in state.results.iter().enumerate() {
        let row = index / cols;
        let col = index % cols;

        // y is inverted (0 at bottom), so flip row
        let base_y = (rows - 1 - row) as f64;
        let base_x = col as f64;

        // Fill the cell with a grid of points
        let coords = match result {
            TrialState::Pending => &mut pending_coords,
            TrialState::Running => &mut running_coords,
            TrialState::Success(_) => &mut success_coords,
            TrialState::Failure(_) => &mut failure_coords,
        };

        for sy in 0..subdivisions {
            for sx in 0..subdivisions {
                coords.push((base_x + sx as f64 * step, base_y + sy as f64 * step));
            }
        }
    }

    let canvas = Canvas::default()
        .block(Block::bordered().title(title))
        .marker(Marker::HalfBlock)
        .x_bounds([0.0, cols as f64])
        .y_bounds([0.0, rows as f64])
        .paint(|ctx| {
            ctx.draw(&Points {
                coords: &pending_coords,
                color: Color::DarkGray,
            });
            ctx.draw(&Points {
                coords: &running_coords,
                color: Color::Yellow,
            });
            ctx.draw(&Points {
                coords: &success_coords,
                color: Color::Green,
            });
            ctx.draw(&Points {
                coords: &failure_coords,
                color: Color::Red,
            });
        });

    frame.render_widget(canvas, area);
}

fn render_stats(frame: &mut Frame, area: Rect, state: &RenderState) {
    let mut totals = TrialStatistics::default();
    let mut count = 0_usize;

    for result in &state.results {
        if let TrialState::Success(stats) = result {
            count += 1;
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

    let block = Block::bordered().title(" Statistics ");
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let columns = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .split(inner);

    // I/O column
    let read_kib = totals.bytes_read as f64 / 1024.0;
    let written_kib = totals.bytes_written as f64 / 1024.0;
    let io_lines = vec![
        Line::from(vec![
            Span::styled("read ", Style::new().dim()),
            Span::raw(format!("{}", totals.files_read)),
            Span::styled(" files ", Style::new().dim()),
            Span::raw(format!("({read_kib:.1} KiB)")),
        ]),
        Line::from(vec![
            Span::styled("wrote ", Style::new().dim()),
            Span::raw(format!("{}", totals.files_written)),
            Span::styled(" files ", Style::new().dim()),
            Span::raw(format!("({written_kib:.1} KiB)")),
            Span::styled("  removed ", Style::new().dim()),
            Span::raw(format!("{}", totals.files_removed)),
        ]),
    ];
    frame.render_widget(Paragraph::new(io_lines), columns[0]);

    // Timing column
    let timing_lines = if count == 0 {
        vec![Line::from(Span::styled(
            "waiting for completed trials...",
            Style::new().dim().italic(),
        ))]
    } else {
        let avg_total = average(
            totals.run
                + totals.assert
                + totals.verify
                + totals.read_source
                + totals.parse
                + totals.render_stderr,
            count,
        );

        vec![
            Line::from(vec![
                Span::styled("avg/", Style::new().dim()),
                Span::raw(format!("{count}")),
                Span::styled("  total ", Style::new().dim()),
                Span::styled(format_duration(avg_total), Style::new().bold()),
            ]),
            Line::from(vec![
                Span::styled("read ", Style::new().dim()),
                Span::raw(format_duration(average(totals.read_source, count))),
                Span::styled("  parse ", Style::new().dim()),
                Span::raw(format_duration(average(totals.parse, count))),
                Span::styled("  run ", Style::new().dim()),
                Span::raw(format_duration(average(totals.run, count))),
                Span::styled("  verify ", Style::new().dim()),
                Span::raw(format_duration(average(totals.verify, count))),
            ]),
        ]
    };
    frame.render_widget(Paragraph::new(timing_lines), columns[1]);
}

fn render(frame: &mut Frame, state: &mut RenderState) {
    let area = frame.area();

    let layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(4), Constraint::Length(4)])
        .split(area);

    render_grid(frame, layout[0], state);
    render_stats(frame, layout[1], state);
}

fn event_loop<B: Backend>(
    mut terminal: Terminal<B>,
    mut state: RenderState,
    rx: mpsc::Receiver<Event>,
) -> Result<Terminal<B>, B::Error> {
    // Initial draw
    terminal.draw(|frame| render(frame, &mut state))?;

    let mut redraw = true;
    let mut size = terminal.size()?;
    let mut text = Text::default();

    loop {
        if !text.lines.is_empty() {
            let paragraph = Paragraph::new(text);
            let height = paragraph.line_count(size.width);

            terminal.insert_before(height as u16, |buffer| {
                paragraph.render(buffer.area, buffer);
            })?;
            text = Text::default();
            redraw = true;
        }

        if redraw {
            terminal.draw(|frame| render(frame, &mut state))?;
        }

        redraw = false;

        let event = rx
            .recv()
            .expect("receivers should be dropped before sender");
        let events = iter::once(event).chain(rx.try_iter());

        for event in events {
            redraw = match event {
                Event::TracingMessage(bytes) => {
                    let tracing_text = bytes.into_text().expect("bytes must be valid ANSI");
                    text += tracing_text;

                    false
                }
                Event::Resize => {
                    terminal.autoresize()?;
                    size = terminal.size()?;

                    true
                }
                Event::Tick => true,
                Event::Shutdown => return Ok(terminal),

                Event::TrialStarted(index) => {
                    state.results[index] = TrialState::Running;
                    true
                }
                Event::TrialFinished(index, success, trial_stats) => {
                    let next = if success {
                        TrialState::Success(trial_stats)
                    } else {
                        TrialState::Failure(trial_stats)
                    };

                    state.results[index] = next;
                    true
                }
            };
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
