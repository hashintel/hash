use alloc::collections::BinaryHeap;
use core::{cmp, iter, time::Duration};
use std::{io, sync::mpsc, thread, time::Instant};

use ansi_to_tui::IntoText as _;
use error_stack::Report;
use ratatui::{
    DefaultTerminal, Frame, Terminal, TerminalOptions,
    crossterm::event,
    layout::{Constraint, Layout, Rect},
    prelude::Backend,
    style::{Color, Style},
    text::{Line, Span, Text},
    widgets::{Block, Gauge, LineGauge, Paragraph, Widget as _, Wrap},
};
use rayon::iter::{IndexedParallelIterator as _, IntoParallelIterator, ParallelIterator as _};
use tracing_subscriber::{layer::SubscriberExt as _, util::SubscriberInitExt as _};

use crate::harness::trial::{
    Trial, TrialContext, TrialError, TrialGroup, TrialSet, TrialStatistics,
};

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
        self.sender
            .send(Event::TracingMessage(buf.to_vec()))
            .map_err(io::Error::other)?;

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

#[expect(clippy::needless_pass_by_value)]
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
                event::Event::FocusGained
                | event::Event::FocusLost
                | event::Event::Key(_)
                | event::Event::Mouse(_)
                | event::Event::Paste(_) => {}
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
    set: TrialSet<'trial, 'graph>,
    results: Vec<TrialState>,
    start_time: Instant,
}
impl<'trial, 'graph> RenderState<'trial, 'graph> {
    fn new(set: &TrialSet<'trial, 'graph>) -> Self {
        Self {
            set: set.clone(),
            results: Vec::from_fn(set.len(), |_| TrialState::Pending),
            start_time: Instant::now(),
        }
    }
}

fn format_duration(duration: Duration) -> String {
    format!("{duration:.2?}")
}

struct TrialCounts {
    pending: usize,
    running: usize,
    success: usize,
    failure: usize,
}

impl TrialCounts {
    fn from_results(results: &[TrialState]) -> Self {
        let mut counts = Self {
            pending: 0,
            running: 0,
            success: 0,
            failure: 0,
        };
        for result in results {
            match result {
                TrialState::Pending => counts.pending += 1,
                TrialState::Running => counts.running += 1,
                TrialState::Success(_) => counts.success += 1,
                TrialState::Failure(_) => counts.failure += 1,
            }
        }
        counts
    }

    const fn completed(&self) -> usize {
        self.success + self.failure
    }

    const fn total(&self) -> usize {
        self.pending + self.running + self.success + self.failure
    }
}

struct TrialByTotal<'trial, 'graph> {
    group: &'trial TrialGroup<'graph>,
    trial: &'trial Trial,

    total: Duration,
}

impl PartialEq for TrialByTotal<'_, '_> {
    fn eq(&self, other: &Self) -> bool {
        self.total == other.total
    }
}

impl Eq for TrialByTotal<'_, '_> {}

impl PartialOrd for TrialByTotal<'_, '_> {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for TrialByTotal<'_, '_> {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.total.cmp(&other.total)
    }
}

#[expect(clippy::float_arithmetic, clippy::cast_precision_loss)]
fn render_header(frame: &mut Frame, area: Rect, state: &RenderState, counts: &TrialCounts) {
    let total = counts.total();
    let completed = counts.completed();
    let elapsed = state.start_time.elapsed();

    let ratio = if total > 0 {
        completed as f64 / total as f64
    } else {
        0.0
    };

    // Calculate throughput and ETA
    let throughput = if elapsed.as_secs_f64() > 0.0 {
        completed as f64 / elapsed.as_secs_f64()
    } else {
        0.0
    };

    let remaining = total.saturating_sub(completed);
    let eta = if throughput > 0.0 {
        Duration::from_secs_f64(remaining as f64 / throughput)
    } else {
        Duration::ZERO
    };

    let elapsed_str = format_duration(elapsed);
    let eta_str = if remaining > 0 {
        format!("ETA {}", format_duration(eta))
    } else {
        "done".to_owned()
    };

    let label = Line::from(vec![
        Span::styled(format!(" {completed}/{total} "), Style::new().bold()),
        Span::styled("\u{2502}", Style::new().dim()),
        Span::raw(" "),
        Span::styled(format!("{}", counts.pending), Style::new().gray()),
        Span::styled(" pending ", Style::new().dim()),
        Span::styled(format!("{}", counts.running), Style::new().yellow()),
        Span::styled(" running ", Style::new().dim()),
        Span::styled(format!("{}", counts.success), Style::new().green()),
        Span::styled(" passed ", Style::new().dim()),
        Span::styled(format!("{}", counts.failure), Style::new().red()),
        Span::styled(" failed ", Style::new().dim()),
        Span::styled("\u{2502}", Style::new().dim()),
        Span::styled(format!(" {throughput:.1}/s "), Style::new().cyan()),
        Span::styled("\u{2502}", Style::new().dim()),
        Span::styled(format!(" {elapsed_str} "), Style::new().dim()),
        Span::styled(&eta_str, Style::new().dim()),
    ]);

    let color = if counts.failure > 0 {
        Color::Red
    } else if counts.running > 0 {
        Color::Yellow
    } else if completed == total && total > 0 {
        Color::Green
    } else {
        Color::DarkGray
    };

    let gauge = LineGauge::default()
        .filled_style(Style::new().fg(color))
        .filled_symbol(ratatui::symbols::line::THICK.horizontal)
        .unfilled_symbol(ratatui::symbols::line::THICK.horizontal)
        .ratio(ratio)
        .label(label);

    frame.render_widget(gauge, area);
}

fn render_running(frame: &mut Frame, area: Rect, state: &RenderState, counts: &TrialCounts) {
    let block = Block::bordered().title(" Running ");
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let running: Vec<Line> = state
        .results
        .iter()
        .enumerate()
        .filter(|(_, state)| matches!(state, TrialState::Running))
        .map(|(idx, _)| {
            let (group, trial) = state.set.trials[idx];
            Line::styled(trial.name(group).to_string(), Style::new().yellow())
        })
        .collect();

    let para = if running.is_empty() {
        let msg = if counts.completed() == counts.total() && counts.total() > 0 {
            Span::styled("\u{2713} complete", Style::new().green())
        } else {
            Span::styled("waiting...", Style::new().dim().italic())
        };
        Paragraph::new(Line::from(msg))
    } else {
        Paragraph::new(running)
    };

    frame.render_widget(para, inner);
}

#[expect(clippy::float_arithmetic, clippy::cast_precision_loss)]
fn render_stats_io(frame: &mut Frame, area: Rect, totals: &TrialStatistics) {
    let read_kib = totals.bytes_read as f64 / 1024.0;
    let written_kib = totals.bytes_written as f64 / 1024.0;

    let lines = vec![
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
        ]),
        Line::from(vec![
            Span::styled("removed ", Style::new().dim()),
            Span::raw(format!("{}", totals.files_removed)),
            Span::styled(" files", Style::new().dim()),
        ]),
    ];

    frame.render_widget(Paragraph::new(lines), area);
}

#[expect(clippy::float_arithmetic)]
fn render_stats_phase(frame: &mut Frame, area: Rect, finished: usize, totals: &TrialStatistics) {
    const PHASES: usize = 6;

    if finished == 0 {
        return;
    }

    let [total_row, phase_rows] =
        area.layout(&Layout::vertical([Constraint::Length(1), Constraint::Min(0)]).spacing(1));

    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled("total   ", Style::new().dim()),
            Span::raw(format_duration(totals.total)),
        ])),
        total_row,
    );

    let [name_col, gauge_col] = phase_rows
        .layout(&Layout::horizontal([Constraint::Length(6), Constraint::Fill(1)]).spacing(2));

    let phases: [_; PHASES] = [
        ("run", totals.run, Color::Cyan),
        ("parse", totals.parse, Color::Blue),
        ("read", totals.read_source, Color::Green),
        ("verify", totals.verify, Color::Yellow),
        ("assert", totals.assert, Color::Magenta),
        ("render", totals.render_stderr, Color::Gray),
    ];

    frame.render_widget(
        Paragraph::new(phases.map(|(name, _, _)| Line::raw(name)).to_vec())
            .style(Style::new().dim()),
        name_col,
    );

    let gauges = gauge_col.layout::<PHASES>(&Layout::vertical([Constraint::Length(1); PHASES]));

    for (index, &(_, time, color)) in phases.iter().enumerate() {
        let ratio = time.as_millis_f64() / totals.total.as_millis_f64();

        frame.render_widget(
            Gauge::default()
                .gauge_style(Style::default().fg(color))
                .label(format!("{:.1}%", ratio * 100.0))
                .ratio(ratio)
                .use_unicode(true),
            gauges[index],
        );
    }
}

#[expect(clippy::integer_division, clippy::integer_division_remainder_used)]
fn render_stats_distribution(frame: &mut Frame, area: Rect, trials: &[TrialByTotal<'_, '_>]) {
    if trials.len() < 2 {
        return;
    }

    let percentile = |percentile: usize| trials[(trials.len() * percentile) / 100].total;

    let lines = vec![
        Line::from(vec![
            Span::styled("min  ", Style::new().dim()),
            Span::styled(
                format_duration(trials.first().map(|trial| trial.total).unwrap_or_default()),
                Style::new().green(),
            ),
        ]),
        Line::from(vec![
            Span::styled("p25  ", Style::new().dim()),
            Span::raw(format_duration(percentile(25))),
        ]),
        Line::from(vec![
            Span::styled("p50  ", Style::new().dim()),
            Span::raw(format_duration(percentile(50))),
        ]),
        Line::from(vec![
            Span::styled("p75  ", Style::new().dim()),
            Span::raw(format_duration(percentile(75))),
        ]),
        Line::from(vec![
            Span::styled("p95  ", Style::new().dim()),
            Span::styled(format_duration(percentile(95)), Style::new().yellow()),
        ]),
        Line::from(vec![
            Span::styled("max  ", Style::new().dim()),
            Span::styled(
                format_duration(trials.last().map(|stat| stat.total).unwrap_or_default()),
                Style::new().red(),
            ),
        ]),
    ];

    frame.render_widget(Paragraph::new(lines), area);
}

fn render_stats_slowest(frame: &mut Frame, area: Rect, trials: &[TrialByTotal<'_, '_>]) {
    if trials.is_empty() {
        return;
    }

    let max_slowest = area.height as usize;

    let lines: Vec<Line> = trials
        .iter()
        .rev()
        .take(max_slowest)
        .map(
            |TrialByTotal {
                 group,
                 trial,
                 total,
             }| {
                Line::from(vec![
                    Span::styled(format_duration(*total), Style::new().red()),
                    Span::styled(" ", Style::new()),
                    Span::raw(trial.name(group).to_string()),
                ])
            },
        )
        .collect();

    frame.render_widget(Paragraph::new(lines), area);
}

fn render_stats(frame: &mut Frame, area: Rect, state: &RenderState) {
    let mut slowest = BinaryHeap::new();
    let mut totals = TrialStatistics::default();
    let mut finished = 0_usize;

    for (index, trial_state) in state.results.iter().enumerate() {
        let (TrialState::Success(trial_stats) | TrialState::Failure(trial_stats)) = trial_state
        else {
            continue;
        };

        finished += 1;
        totals.plus(trial_stats);

        let (group, trial) = state.set.trials[index];
        slowest.push(TrialByTotal {
            group,
            trial,
            total: trial_stats.total,
        });
    }

    let fastest = slowest.into_sorted_vec();

    let block = Block::bordered().title(" Statistics ");
    let inner = block.inner(area);

    let [io_column, phase_column, dist_column, slowest_col] = inner.layout(
        &Layout::horizontal([
            Constraint::Percentage(25),
            Constraint::Percentage(25),
            Constraint::Percentage(20),
            Constraint::Percentage(30),
        ])
        .spacing(4),
    );

    render_stats_io(frame, io_column, &totals);
    render_stats_phase(frame, phase_column, finished, &totals);
    render_stats_distribution(frame, dist_column, &fastest);
    render_stats_slowest(frame, slowest_col, &fastest);

    frame.render_widget(block, area);
}

fn render(frame: &mut Frame, state: &mut RenderState) {
    let area = frame.area();
    let counts = TrialCounts::from_results(&state.results);

    let [header_row, content_row] = area.layout(&Layout::vertical([
        Constraint::Length(1),
        Constraint::Min(5),
    ]));

    let [running_col, stats_col] = content_row.layout(&Layout::horizontal([
        Constraint::Length(30),
        Constraint::Min(50),
    ]));

    render_header(frame, header_row, state, &counts);
    render_running(frame, running_col, state, &counts);
    render_stats(frame, stats_col, state);
}

const INLINE_HEIGHT: u16 = 12;

fn event_loop<B: Backend>(
    mut terminal: Terminal<B>,
    mut state: RenderState,
    rx: mpsc::Receiver<Event>,
) -> Result<Terminal<B>, B::Error> {
    let mut redraw = true;
    let mut shutdown = false;

    let mut size = terminal.size()?;
    let mut text = Text::default();

    loop {
        #[expect(clippy::cast_possible_truncation)]
        if !text.lines.is_empty() {
            let paragraph = Paragraph::new(text).wrap(Wrap { trim: true });
            let height = paragraph.line_count(size.width) as u16;

            terminal.insert_before(height, |buffer| {
                (&paragraph).render(buffer.area, buffer);
            })?;

            text = Text::default();
            redraw = true;
        }

        if redraw {
            terminal.draw(|frame| render(frame, &mut state))?;
        }

        if shutdown {
            drop(rx);
            return Ok(terminal);
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
                Event::Shutdown => {
                    shutdown = true;
                    true
                }

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
    set: TrialSet,
    context: &TrialContext,
    sender: mpsc::Sender<Event>,
) -> Vec<Report<[TrialError]>> {
    let reports = set.trials
        .into_par_iter()
        .enumerate()
        .map(|(index, (group, trial))| {
            let _result = sender.send(Event::TrialStarted(index));

            tracing::debug!(group = group.metadata.name(), trial = ?trial.namespace, "running trial");
            let (stats, result) = trial.run_catch(&group.metadata, context);
            let _result = sender.send(Event::TrialFinished(index, result.is_ok(), stats));
            tracing::debug!(group = group.metadata.name(), trial = ?trial.namespace, result = ?result, "finished trial");

            result
        })
        .filter_map(Result::err)
        .collect();

    tracing::info!("finished trial execution");
    drop(sender);
    reports
}

pub(crate) fn init() {}

pub struct Tui {
    tx: mpsc::Sender<Event>,
    rx: mpsc::Receiver<Event>,
    terminal: DefaultTerminal,
}

impl Tui {
    pub(crate) fn init() -> Self {
        let (tx, rx) = mpsc::channel();

        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer().with_writer({
                let writer = TracingWriter { sender: tx.clone() };

                move || writer.clone()
            }))
            .init();

        let terminal = ratatui::init_with_options(TerminalOptions {
            viewport: ratatui::Viewport::Inline(INLINE_HEIGHT),
        });

        Self { terminal, tx, rx }
    }

    pub(crate) fn run(self, set: TrialSet, context: &TrialContext) -> Vec<Report<[TrialError]>> {
        let Self { tx, rx, terminal } = self;

        let (reports, _) = thread::scope(|scope| {
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

            let state = RenderState::new(&set);
            let handle = scope.spawn(move || event_loop(terminal, state, rx));

            let reports = run_trials(set, context, tx.clone());
            tx.send(Event::Shutdown)
                .expect("should be able to send shutdown");
            drop(tx);

            let terminal = handle
                .join()
                .expect("should be able to join handle")
                .expect("should have not errored in event loop");

            (reports, terminal)
        });

        ratatui::restore();
        reports
    }
}
