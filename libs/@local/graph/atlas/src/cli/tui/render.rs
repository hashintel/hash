//! Drawing one frame of the dashboard: the stage rail, the loss chart beside the placement map,
//! and the log pane.
//!
//! [`frame`] is a pure function of the model plus the tick that animates the running stage, so a
//! frame is reproducible: the same [`RunState`] and tick draw the same cells. Every glyph choice,
//! label, and color lives here - the model carries no presentation, and the pipeline's [`Stage`]
//! carries no prose.

use core::{num::NonZero, time::Duration};

use ratatui::{
    Frame,
    layout::{Constraint, Layout, Rect},
    style::{Color, Style, Stylize as _},
    symbols::Marker,
    text::{Line, Span},
    widgets::{
        Axis, Block, BorderType, Chart, Dataset, GraphType, Padding, Paragraph,
        canvas::{Canvas, Points},
    },
};

use super::state::{
    ClassifierFolds, EmbeddingWorkload, PlacementMap, ProjectorTraining, RunState, StageStatus,
};
use crate::{math::Vec2, progress::Stage};

/// The dashboard's one accent color, carried by the running stage and the frame titles.
const ACCENT: Color = Color::Cyan;

/// Frames of the running stage's spinner, in braille.
#[expect(
    clippy::non_ascii_literal,
    reason = "the dashboard's glyphs are its rendering vocabulary"
)]
const SPINNER: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/// The widest stage label, for the rail's leader-dot column.
const LABEL_WIDTH: usize = 11;

/// Rows of the stage rail: one per pipeline stage, plus the frame around them.
#[expect(
    clippy::cast_possible_truncation,
    reason = "the stage array has twelve elements"
)]
const RAIL_HEIGHT: u16 = Stage::ALL.len() as u16 + 2;

/// Cells of the rail's completion bar: one per stage, so the bar needs no scaling.
const BAR_WIDTH: usize = Stage::ALL.len();

/// Cells of a stage counter's bar, narrow enough to leave the row its leader dots.
const COUNTER_WIDTH: usize = 8;

/// Rows of the loss chart at full size, plot and frame together.
const LOSS_HEIGHT: u16 = 9;

/// Rows below which a chart is not worth its own frame.
const LOSS_MINIMUM: u16 = 5;

/// Columns the loss chart keeps for itself before the map takes any.
const LOSS_KEEP: u16 = 48;

/// Columns below which the map is not worth its own frame.
const MAP_MINIMUM: u16 = 24;

/// Columns past which the map stops growing and the curve takes the room.
const MAP_MAXIMUM: u16 = 64;

/// Points the widest map can hold apart: its braille dot grid, two dots per column and four per
/// row inside the frame.
///
/// This is what the dashboard asks a run to sample. A larger sample would cost the run copies of
/// coordinates that land on dots already lit.
pub(super) const MAP_CAPACITY: usize =
    (MAP_MAXIMUM as usize - 2) * 2 * (LOSS_HEIGHT as usize - 2) * 4;

/// The color of the landmark skeleton, against the accent the interior sample is drawn in.
const SKELETON: Color = Color::Magenta;

/// How much wider than the placement the map's viewport is drawn.
///
/// The map carries no axis labels, so widening states nothing untrue - it only keeps the outermost
/// rows a dot inside the frame rather than against its wall.
const MAP_MARGIN: f64 = 1.04;

/// Rows the log pane keeps whatever else is on screen.
const LOG_MINIMUM: u16 = 3;

/// Draws one frame: the stage rail above, the log tail below, and between them the placement's
/// band - its loss curve, and its map once the pane is wide enough to hold both.
pub(super) fn frame(frame: &mut Frame, state: &RunState, tick: usize) {
    let elapsed = state.elapsed();
    let area = frame.area();
    let [rail, band, log] = Layout::vertical([
        Constraint::Length(RAIL_HEIGHT),
        Constraint::Length(band_height(state, area.height)),
        Constraint::Min(LOG_MINIMUM),
    ])
    .areas(area);
    let [loss, map] = Layout::horizontal([
        Constraint::Min(0),
        Constraint::Length(map_width(state, band.width)),
    ])
    .areas(band);

    render_rail(frame, rail, state, elapsed, tick);
    if let Some(training) = state.projector() {
        render_loss(frame, loss, training);
    }
    if let Some(placement) = state.placement().filter(|_| !map.is_empty()) {
        render_map(frame, map, placement);
    }
    render_log(frame, log, state);
}

/// The rows the placement's band may claim.
///
/// The band appears only once the placement has something to show, and it never crowds out the
/// rail or the log: the rail is the run's shape and the log is its voice, so the band takes what
/// those two leave and stays away entirely below the height where a plot says anything.
const fn band_height(state: &RunState, available: u16) -> u16 {
    if state.projector().is_none() && state.placement().is_none() {
        return 0;
    }

    let spare = available.saturating_sub(RAIL_HEIGHT + LOG_MINIMUM);
    if spare < LOSS_MINIMUM {
        return 0;
    }

    spare.min(LOSS_HEIGHT)
}

/// The columns the map takes out of the band, beside the curve.
///
/// The curve is the reading an operator acts on, so it keeps its width first and the map takes
/// what is left over; below the width where dots resolve anything the map stays away entirely,
/// and past the width where it stops gaining detail the curve takes the rest of the growth.
const fn map_width(state: &RunState, available: u16) -> u16 {
    if state.placement().is_none() {
        return 0;
    }

    let spare = available.saturating_sub(LOSS_KEEP);
    if spare < MAP_MINIMUM {
        return 0;
    }

    spare.min(MAP_MAXIMUM)
}

/// Draws the stage rail: one row per pipeline stage, with the run's clock in the frame.
#[expect(
    clippy::non_ascii_literal,
    reason = "the dashboard's glyphs are its rendering vocabulary"
)]
fn render_rail(frame: &mut Frame, area: Rect, state: &RunState, elapsed: Duration, tick: usize) {
    let completed = state.completed_stages();
    let block = Block::bordered()
        .border_type(BorderType::Rounded)
        .border_style(Style::new().dim())
        .padding(Padding::horizontal(1))
        .title_top(Line::from(" atlas fit ".bold().fg(ACCENT)))
        .title_top(Line::from(format!(" {} ", duration(elapsed)).dim()).right_aligned())
        .title_bottom(progress_bar(completed, Stage::ALL.len()).right_aligned());
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let width = inner.width as usize;
    let mut rows = Vec::with_capacity(Stage::ALL.len());
    for (index, stage) in Stage::ALL.into_iter().enumerate() {
        let label = label(stage);
        rows.push(match state.status(index, elapsed) {
            StageStatus::Done(span) => stage_row(
                Span::from("✓").fg(Color::Green),
                label,
                Style::new().dim(),
                None,
                &duration(span),
                width,
            ),
            StageStatus::Running(span) => stage_row(
                Span::from(SPINNER[tick.rem_euclid(SPINNER.len())]).fg(ACCENT),
                label,
                Style::new().bold().fg(ACCENT),
                counter(state, stage).as_deref(),
                &duration(span),
                width,
            ),
            // A stage the run has not reached says only its name: the
            // quiet rows are the remaining work.
            StageStatus::Pending => Line::from(vec![
                Span::from("· ").dim(),
                Span::from(label).fg(Color::DarkGray),
            ]),
        });
    }

    frame.render_widget(Paragraph::new(rows), inner);
}

/// Composes one timed stage row: glyph, label, leader dots, and the span, right-aligned.
#[expect(
    clippy::non_ascii_literal,
    reason = "the dashboard's glyphs are its rendering vocabulary"
)]
fn stage_row<'row>(
    glyph: Span<'row>,
    label: &str,
    style: Style,
    counter: Option<&str>,
    span: &str,
    width: usize,
) -> Line<'row> {
    // A counter takes the room it needs plus its leading space; the
    // glyphs are single-width, so counting characters counts columns.
    let counter = counter.map(|text| {
        (
            Span::from(format!(" {text}")).fg(ACCENT),
            text.chars().count() + 1,
        )
    });
    let (counter, counter_width) = counter.map_or((None, 0), |(span, width)| (Some(span), width));

    // Glyph, its space, the label column, a space either side of the
    // dots, and the span; whatever is left over becomes leader dots.
    let used = 4 + LABEL_WIDTH.max(label.len()) + counter_width + span.len();
    let dots = width.saturating_sub(used);

    let mut row = vec![
        glyph,
        Span::from(" "),
        Span::from(format!("{label:<LABEL_WIDTH$}")).style(style),
    ];
    row.extend(counter);
    row.push(Span::from(format!(" {}", "·".repeat(dots))).fg(Color::DarkGray));
    row.push(Span::from(format!(" {span}")).dim());

    Line::from(row)
}

/// The counter a running stage carries, from what the run has reported of it.
fn counter(run: &RunState, stage: Stage) -> Option<String> {
    match stage {
        Stage::Ingest => run.embedding().map(embedding_counter),
        Stage::Classifier => run.classifier().map(classifier_counter),
        Stage::Policy
        | Stage::Adjacency
        | Stage::Relations
        | Stage::Knn
        | Stage::Semantic
        | Stage::Landmarks
        | Stage::Lod
        | Stage::Seal
        | Stage::Admission => None,
        Stage::Projector => run.projector().map(projector_counter),
    }
}

/// The placement counter: the schedule's steps as a bar, once training has begun.
fn projector_counter(training: &ProjectorTraining) -> String {
    let Some(steps) = NonZero::new(training.steps) else {
        return String::new();
    };

    format!(
        "{} {}/{steps}",
        counter_bar(training.done, steps),
        training.done,
    )
}

/// The classifier counter: cross-validation folds landed, as a bar.
fn classifier_counter(folds: ClassifierFolds) -> String {
    let Some(total) = NonZero::new(folds.total) else {
        return String::new();
    };

    format!(
        "{} {}/{total} folds",
        counter_bar(folds.done, total),
        folds.done
    )
}

/// The card-embedding counter: the provider's share as a bar, or the reuse that avoided it.
fn embedding_counter(workload: EmbeddingWorkload) -> String {
    let Some(embedded) = NonZero::new(workload.embedded) else {
        return format!("{} reused", workload.reused);
    };

    format!(
        "{} {}/{embedded}",
        counter_bar(workload.done, embedded),
        workload.done,
    )
}

/// A fixed-width bar of one workload's completion.
#[expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "a cell lights once its whole share of the workload is covered, so the truncation is \
              the reading"
)]
#[expect(
    clippy::non_ascii_literal,
    reason = "the dashboard's glyphs are its rendering vocabulary"
)]
fn counter_bar(done: usize, total: NonZero<usize>) -> String {
    let filled = (done * COUNTER_WIDTH / total.get()).min(COUNTER_WIDTH);

    format!(
        "{}{}",
        "█".repeat(filled),
        "░".repeat(COUNTER_WIDTH - filled)
    )
}

/// The rail's completion bar: filled blocks over the stages still to come.
#[expect(
    clippy::non_ascii_literal,
    reason = "the dashboard's glyphs are its rendering vocabulary"
)]
fn progress_bar(completed: usize, total: usize) -> Line<'static> {
    // One cell per stage: the bar is the rail's own index, not a
    // rescaling of it.
    let filled = completed.min(BAR_WIDTH);
    let color = if completed == total {
        Color::Green
    } else {
        ACCENT
    };

    Line::from(vec![
        Span::from(format!(" stages {completed}/{total} ")).dim(),
        Span::from("█".repeat(filled)).fg(color),
        Span::from("░".repeat(BAR_WIDTH.saturating_sub(filled))).fg(Color::DarkGray),
        Span::from(" "),
    ])
}

/// Draws the placement's descent: the composite objective against the schedule's step axis.
///
/// The curve is drawn at braille resolution, so a pane sixty columns wide resolves a hundred and
/// twenty steps of a schedule that is usually longer - the chart is the shape of the descent, and
/// the exact current value rides the frame's title.
fn render_loss(frame: &mut Frame, area: Rect, training: &ProjectorTraining) {
    let points: Vec<(f64, f64)> = curve(training).into_iter().collect();
    let [low, high] = value_bounds(points.iter().map(|&(_, loss)| loss));
    let [first, last] = step_bounds(training);

    let block = Block::bordered()
        .border_type(BorderType::Rounded)
        .border_style(Style::new().dim())
        .padding(Padding::horizontal(1))
        .title_top(Line::from(" loss ".bold().fg(ACCENT)))
        .title_top(
            Line::from(format!(" {:.4} ", training.last.total()))
                .fg(ACCENT)
                .right_aligned(),
        )
        .title_bottom(Line::from(breakdown(training, area.width)).right_aligned());

    let dataset = Dataset::default()
        .marker(Marker::Braille)
        .graph_type(GraphType::Line)
        .style(Style::new().fg(ACCENT))
        .data(&points);

    let chart = Chart::new(vec![dataset])
        .block(block)
        .x_axis(Axis::default().bounds([first, last]))
        .y_axis(Axis::default().bounds([low, high]).labels([
            Span::from(format!("{low:.2}")).dim(),
            Span::from(format!("{high:.2}")).dim(),
        ]));

    frame.render_widget(chart, area);
}

/// The retained losses as plot points on the schedule's step axis.
#[expect(
    clippy::cast_precision_loss,
    reason = "a schedule's step count is far inside f64's exact integer range"
)]
fn curve(training: &ProjectorTraining) -> impl IntoIterator<Item = (f64, f64)> {
    let first = training.first;

    training
        .losses
        .iter()
        .enumerate()
        .map(move |(offset, &loss)| ((first + offset) as f64, f64::from(loss)))
}

/// The chart's value axis: the observed range itself, widened only when it is a single value.
///
/// The axis is not padded, so both labels name a loss the run actually reached - a padded axis
/// would print a bound the objective never took, and below zero at that.
#[expect(
    clippy::float_cmp,
    reason = "the degenerate case is the exact equality: a window holding one distinct value has \
              no range to plot in"
)]
fn value_bounds(values: impl IntoIterator<Item = f64>) -> [f64; 2] {
    let (low, high) = values
        .into_iter()
        .filter(|value| value.is_finite())
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(low, high), value| {
            (low.min(value), high.max(value))
        });

    if low > high {
        // Nothing finite to plot yet.
        return [0.0, 1.0];
    }
    if low == high {
        // A flat curve still needs a plot to sit in the middle of.
        return [low - 0.5, high + 0.5];
    }

    [low, high]
}

/// The chart's step axis: the retained window, never narrower than one step.
#[expect(
    clippy::cast_precision_loss,
    reason = "a schedule's step count is far inside f64's exact integer range"
)]
fn step_bounds(training: &ProjectorTraining) -> [f64; 2] {
    let first = training.first as f64;
    let last = (training.first + training.losses.len().saturating_sub(1)) as f64;

    [first, last.max(first + 1.0)]
}

/// The last step's objective, family by family, for the chart's footer.
///
/// The footer is all or nothing: a title wider than its frame is drawn over the corner, so a pane
/// too narrow for the whole breakdown shows the plot and its total alone.
fn breakdown(training: &ProjectorTraining, width: u16) -> String {
    let loss = training.last;

    let text = format!(
        " semantic {:.3} · ordinary {:.3} · hard {:.3} · relation {:.3} · support {:.3} ",
        loss.semantic,
        loss.ordinary,
        loss.hard,
        loss.relation,
        loss.anchor + loss.landmark,
    );

    if text.chars().count() + 2 > width as usize {
        return String::new();
    }

    text
}

/// Draws the placement itself: the sampled rows as braille dots, the skeleton picked out.
///
/// The map is the run's shape becoming true - a cloud that starts as noise around the landmarks
/// and pulls itself into the atlas the fit will publish. It shows the sample the observer asked
/// for, not the corpus: at braille resolution a pane forty columns wide resolves eighty dots
/// across, so a few thousand points is already more than the frame can separate.
fn render_map(frame: &mut Frame, area: Rect, placement: &PlacementMap) {
    let block = Block::bordered()
        .border_type(BorderType::Rounded)
        .border_style(Style::new().dim())
        .title_top(Line::from(" map ".bold().fg(ACCENT)))
        .title_bottom(population(placement, area.width).right_aligned());
    let inner = block.inner(area);

    let (skeleton, interior) = placement.positions.split_at(placement.landmarks);
    let skeleton: Vec<(f64, f64)> = drawable(skeleton).into_iter().collect();
    let interior: Vec<(f64, f64)> = drawable(interior).into_iter().collect();
    let [horizontal, vertical] = map_bounds(&placement.positions, inner);

    let canvas = Canvas::default()
        .block(block)
        .marker(Marker::Braille)
        .x_bounds(horizontal)
        .y_bounds(vertical)
        .paint(|context| {
            context.draw(&Points {
                coords: &interior,
                color: ACCENT,
            });
            // Both shapes share one layer: a cell holding a landmark
            // takes the skeleton's color and keeps the interior dots
            // that share it, where a second layer would replace them.
            context.draw(&Points {
                coords: &skeleton,
                color: SKELETON,
            });
        });

    frame.render_widget(canvas, area);
}

/// The positions a canvas can place, as its coordinates.
///
/// A non-finite coordinate is dropped rather than drawn: the canvas clamps what it cannot compare
/// into the corner of the frame, which would report a row sitting somewhere it is not. A run whose
/// placement diverges fails in the trainer instead of arriving here.
fn drawable(positions: &[Vec2]) -> impl IntoIterator<Item = (f64, f64)> {
    positions
        .iter()
        .map(|position| (f64::from(position.x()), f64::from(position.y())))
        .filter(|&(x, y)| x.is_finite() && y.is_finite())
}

/// The map's viewport: the placement's own extent, squared against the pane's dot grid.
///
/// A braille cell is two dots wide and four tall over a terminal cell about twice as tall as it is
/// wide, so a dot is very nearly square - and equal data units per dot on both axes is what keeps
/// the atlas its own shape instead of a version stretched to fill the frame. A placement with no
/// extent yet (the first tick of a collapsed init) gets a unit box rather than a degenerate one.
fn map_bounds(positions: &[Vec2], inner: Rect) -> [[f64; 2]; 2] {
    let across = (f64::from(inner.width) * 2.0).max(1.0);
    let down = (f64::from(inner.height) * 4.0).max(1.0);

    let [low_x, high_x, low_y, high_y] = drawable(positions).into_iter().fold(
        [
            f64::INFINITY,
            f64::NEG_INFINITY,
            f64::INFINITY,
            f64::NEG_INFINITY,
        ],
        |[low_x, high_x, low_y, high_y], (x, y)| {
            [low_x.min(x), high_x.max(x), low_y.min(y), high_y.max(y)]
        },
    );
    if low_x > high_x {
        // Nothing placeable to draw yet.
        return [[-1.0, 1.0], [-1.0, 1.0]];
    }

    // The scale is data units per dot: the axis that needs the most of
    // them sets it, and the other one gets the slack.
    let scale = ((high_x - low_x) / across).max((high_y - low_y) / down);
    let scale = if scale > 0.0 { scale * MAP_MARGIN } else { 1.0 };
    let half_x = scale * across / 2.0;
    let half_y = scale * down / 2.0;
    let center_x = f64::midpoint(low_x, high_x);
    let center_y = f64::midpoint(low_y, high_y);

    [
        [center_x - half_x, center_x + half_x],
        [center_y - half_y, center_y + half_y],
    ]
}

/// The map's footer: how many rows it is drawing, and how many of them are the skeleton.
///
/// All or nothing, like the chart's breakdown: a title wider than its frame is drawn over the
/// corner rather than truncated inside it.
fn population(placement: &PlacementMap, width: u16) -> Line<'static> {
    let text = format!(
        " {} rows · {} landmarks ",
        placement.positions.len(),
        placement.landmarks,
    );

    if text.chars().count() + 2 > width as usize {
        return Line::default();
    }

    Line::from(text.dim())
}

/// Draws the log tail: the newest lines that fit, colored by level.
fn render_log(frame: &mut Frame, area: Rect, state: &RunState) {
    let block = Block::bordered()
        .border_type(BorderType::Rounded)
        .border_style(Style::new().dim())
        .padding(Padding::horizontal(1))
        .title_top(Line::from(" log ".dim()));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let visible = state.log().len().saturating_sub(inner.height as usize);
    let lines: Vec<Line<'_>> = state
        .log()
        .skip(visible)
        .map(|line| Line::from(Span::from(line).style(level_style(line))))
        .collect();

    frame.render_widget(Paragraph::new(lines), inner);
}

/// The style of one log line, by the level token the formatter leads with.
fn level_style(line: &str) -> Style {
    match line.split_whitespace().next() {
        Some("ERROR") => Style::new().fg(Color::Red),
        Some("WARN") => Style::new().fg(Color::Yellow),
        Some("INFO") => Style::new(),
        // Debug and trace records are the run talking to itself.
        _ => Style::new().fg(Color::DarkGray),
    }
}

/// The rail's label for one pipeline stage.
const fn label(stage: Stage) -> &'static str {
    match stage {
        Stage::Ingest => "ingest",
        Stage::Classifier => "classifier",
        Stage::Policy => "policy",
        Stage::Adjacency => "adjacency",
        Stage::Relations => "relations",
        Stage::Knn => "knn",
        Stage::Semantic => "semantic",
        Stage::Landmarks => "landmarks",
        Stage::Projector => "projector",
        Stage::Lod => "lod",
        Stage::Seal => "seal",
        Stage::Admission => "admission",
    }
}

/// Renders one span the way an operator reads a clock: seconds under a minute, then minutes.
fn duration(span: Duration) -> String {
    let seconds = span.as_secs_f64();
    if seconds < 60.0 {
        return format!("{seconds:.1}s");
    }

    // Subtracting whole minutes as a duration keeps the remainder exact
    // without a cast back into floating point.
    let minutes = span.as_secs().div_euclid(60);
    let rest = span.saturating_sub(Duration::from_secs(minutes.saturating_mul(60)));

    format!("{minutes}m {:04.1}s", rest.as_secs_f64())
}

#[cfg(test)]
mod tests {
    use core::time::Duration;

    use ratatui::{Terminal, backend::TestBackend, buffer::Buffer, layout::Rect, style::Color};

    use super::{ACCENT, SKELETON, duration, frame, map_bounds, value_bounds};
    use crate::{
        cli::tui::state::RunState,
        math::Vec2,
        progress::{Batch, CardEmbeddingStats, LossBreakdown, Stage},
    };

    /// The drawn frame as one string per row, trailing blanks trimmed.
    fn rows(buffer: &Buffer) -> Vec<String> {
        (0..buffer.area.height)
            .map(|y| {
                let row: String = (0..buffer.area.width)
                    .map(|x| buffer[(x, y)].symbol())
                    .collect();
                row.trim_end().to_owned()
            })
            .collect()
    }

    /// Draws one frame of a state over a terminal wide enough for the rail.
    fn draw(state: &RunState, tick: usize) -> Vec<String> {
        draw_on(state, tick, 60, 20)
    }

    /// Draws one frame of a state over a terminal of the given shape.
    fn draw_on(state: &RunState, tick: usize, width: u16, height: u16) -> Vec<String> {
        rows(&buffer_on(state, tick, width, height))
    }

    /// The drawn buffer itself, for the assertions that read style rather than text.
    fn buffer_on(state: &RunState, tick: usize, width: u16, height: u16) -> Buffer {
        let mut terminal =
            Terminal::new(TestBackend::new(width, height)).expect("should open a terminal");
        terminal
            .draw(|target| frame(target, state, tick))
            .expect("should draw a frame");

        terminal.backend().buffer().clone()
    }

    /// A grid of interior rows around the origin, and the two landmarks that lead the sample.
    fn placement() -> Vec<Vec2> {
        let mut positions = vec![Vec2::new(-2.0, 0.0), Vec2::new(2.0, 0.0)];
        for column in 0..8_u8 {
            for row in 0..8_u8 {
                positions.push(Vec2::new(
                    f32::from(column).mul_add(0.5, -2.0),
                    f32::from(row).mul_add(0.25, -1.0),
                ));
            }
        }

        positions
    }

    /// A run standing in the placement stage with a snapshot reported.
    fn placed() -> RunState {
        let mut state = training(150, 600);
        state.place_projector(&placement(), 2);

        state
    }

    /// A run standing in the placement stage, `steps` of `total` reported.
    #[expect(
        clippy::cast_precision_loss,
        reason = "the fixture runs a few hundred steps, exactly representable"
    )]
    fn training(steps: usize, total: usize) -> RunState {
        let mut state = RunState::new();
        for (index, stage) in Stage::ALL.into_iter().take(8).enumerate() {
            state.complete_at(stage, Duration::from_secs(index as u64 + 1));
        }
        for step in 0..steps {
            // A decaying curve, so the chart has a real range to label.
            let decay = 0.5_f32.powf(step as f32 / 16.0);
            state.advance_projector(
                step,
                total,
                &LossBreakdown {
                    semantic: 8.0 * decay,
                    ordinary: 1.0 * decay,
                    hard: 0.5 * decay,
                    relation: 2.0 * decay,
                    anchor: 0.0,
                    landmark: 0.5 * decay,
                },
            );
        }

        state
    }

    #[expect(
        clippy::non_ascii_literal,
        reason = "the assertions read the dashboard's own glyphs"
    )]
    #[test]
    fn a_fresh_run_shows_every_stage_with_the_first_one_running() {
        let drawn = draw(&RunState::new(), 0);

        // The rail is the run's whole shape from the first frame: the
        // opening stage spins, the other eleven wait.
        assert!(drawn[1].starts_with("│ ⠋ ingest"), "{drawn:#?}");
        assert!(drawn[2].starts_with("│ · classifier"), "{drawn:#?}");
        assert!(drawn[12].contains("admission"), "{drawn:#?}");
        assert!(drawn[13].contains("stages 0/12"), "{drawn:#?}");
    }

    #[expect(
        clippy::non_ascii_literal,
        reason = "the assertions read the dashboard's own glyphs"
    )]
    #[test]
    fn a_completed_stage_carries_its_glyph_span_and_leader_dots() {
        let mut state = RunState::new();
        state.complete_at(Stage::Ingest, Duration::from_millis(12_400));

        let drawn = draw(&state, 1);

        assert!(drawn[1].starts_with("│ ✓ ingest"), "{drawn:#?}");
        assert!(drawn[1].contains('·'), "{drawn:#?}");
        assert!(drawn[1].ends_with("12.4s │"), "{drawn:#?}");
        assert!(drawn[2].starts_with("│ ⠙ classifier"), "{drawn:#?}");
        assert!(drawn[13].contains("stages 1/12"), "{drawn:#?}");
    }

    #[expect(
        clippy::non_ascii_literal,
        reason = "the assertions read the dashboard's own glyphs"
    )]
    #[test]
    fn the_running_ingest_row_carries_the_embedding_counter() {
        let mut state = RunState::new();
        state.start_embedding(&CardEmbeddingStats {
            reused: 3_072,
            embedded: 1_024,
        });
        state.advance_embedding(Batch {
            done: 512,
            total: 1_024,
        });

        let drawn = draw(&state, 0);

        // Half the paid workload is back, so half the bar is lit and the
        // counter sits between the label and the leader dots.
        assert!(
            drawn[1].starts_with("│ ⠋ ingest      ████░░░░ 512/1024"),
            "{drawn:#?}"
        );
        assert!(drawn[1].ends_with('│'), "{drawn:#?}");
        // The counter belongs to the running stage alone.
        assert!(!drawn[2].contains('░'), "{drawn:#?}");
    }

    #[test]
    fn a_wholly_reused_workload_says_so_instead_of_drawing_an_empty_bar() {
        let mut state = RunState::new();
        state.start_embedding(&CardEmbeddingStats {
            reused: 4_096,
            embedded: 0,
        });

        let drawn = draw(&state, 0);

        assert!(drawn[1].contains("4096 reused"), "{drawn:#?}");
    }

    #[expect(
        clippy::non_ascii_literal,
        reason = "the assertions read the dashboard's own glyphs"
    )]
    #[test]
    fn a_completed_ingest_stage_drops_its_counter_for_its_span() {
        let mut state = RunState::new();
        state.start_embedding(&CardEmbeddingStats {
            reused: 0,
            embedded: 1_024,
        });
        state.advance_embedding(Batch {
            done: 1_024,
            total: 1_024,
        });
        state.complete_at(Stage::Ingest, Duration::from_millis(12_400));

        let drawn = draw(&state, 0);

        assert!(!drawn[1].contains("1024"), "{drawn:#?}");
        assert!(drawn[1].ends_with("12.4s │"), "{drawn:#?}");
    }

    #[expect(
        clippy::non_ascii_literal,
        reason = "the assertions read the dashboard's own glyphs"
    )]
    #[test]
    fn the_running_classifier_row_carries_its_fold_counter() {
        let mut state = RunState::new();
        state.complete_at(Stage::Ingest, Duration::from_secs(1));
        state.start_classifier(4);
        state.complete_classifier_fold();
        state.complete_classifier_fold();
        state.complete_classifier_fold();

        let drawn = draw(&state, 0);

        assert!(
            drawn[2].starts_with("│ ⠋ classifier  ██████░░ 3/4 folds"),
            "{drawn:#?}"
        );
    }

    #[expect(
        clippy::non_ascii_literal,
        reason = "the assertions read the dashboard's own glyphs"
    )]
    #[test]
    fn the_running_projector_row_carries_its_step_counter() {
        let drawn = draw(&training(150, 600), 0);

        // A quarter of the schedule is behind it, so two of the eight
        // cells are lit.
        assert!(
            drawn[9].starts_with("│ ⠋ projector   ██░░░░░░ 150/600"),
            "{drawn:#?}"
        );
    }

    #[expect(
        clippy::non_ascii_literal,
        reason = "the assertions read the dashboard's own glyphs"
    )]
    #[test]
    fn the_loss_chart_labels_the_range_the_run_actually_reached() {
        let drawn = draw_on(&training(150, 600), 0, 96, 30);
        let chart = drawn[14..23].join("\n");

        // The curve runs from 12.0 at step zero to 12.0 * 0.5^(149/16)
        // = 0.0189 at the last; both axis labels are losses the run
        // took, and the title carries the latest to four places.
        assert!(chart.contains(" loss "), "{chart}");
        assert!(chart.contains("12.00"), "{chart}");
        assert!(chart.contains("0.02"), "{chart}");
        assert!(chart.contains("0.0189"), "{chart}");
        assert!(chart.contains("semantic 0.013"), "{chart}");
        assert!(chart.contains('⠉') || chart.contains('⣀'), "{chart}");
    }

    #[test]
    fn a_pane_too_narrow_for_the_breakdown_drops_it_rather_than_the_corner() {
        let drawn = draw_on(&training(150, 600), 0, 60, 30);

        assert!(drawn[14].contains(" loss "), "{drawn:#?}");
        // A title wider than its frame is drawn from the left corner
        // outward, so the footer row is unbroken border or it is a
        // truncated sentence starting mid-word. Absence of the whole
        // breakdown is not enough to tell those apart.
        assert!(
            drawn[22]
                .chars()
                .all(|glyph| matches!(glyph, '╰' | '─' | '╯')),
            "{drawn:#?}"
        );
    }

    /// Whether a glyph is one of the canvas's braille dots.
    fn is_dot(glyph: char) -> bool {
        matches!(glyph, '⠁'..='⣿')
    }

    #[test]
    fn the_map_draws_beside_the_curve_on_a_wide_pane() {
        let drawn = draw_on(&placed(), 0, 120, 30);
        let band = drawn[14..23].join("\n");

        // One band, two frames: the descent on the left, the placement
        // itself on the right, with the sample it draws named under it.
        assert!(drawn[14].contains(" loss "), "{drawn:#?}");
        assert!(drawn[14].contains(" map "), "{drawn:#?}");
        assert!(band.contains("66 rows"), "{band}");
        assert!(band.contains("2 landmarks"), "{band}");
        // The dots are in the right-hand frame, not the chart's.
        assert!(
            drawn[15..22]
                .iter()
                .any(|line| line.chars().skip(58).any(is_dot)),
            "{band}"
        );
    }

    #[test]
    fn a_pane_too_narrow_for_both_keeps_the_curve_alone() {
        let drawn = draw_on(&placed(), 0, 70, 30);

        // The curve is the reading an operator acts on, so a narrow
        // pane gives up the map rather than the descent.
        assert!(drawn[14].contains(" loss "), "{drawn:#?}");
        assert!(!drawn[14].contains(" map "), "{drawn:#?}");
    }

    #[test]
    fn a_run_with_no_snapshot_leaves_the_curve_the_whole_band() {
        let drawn = draw_on(&training(150, 600), 0, 120, 30);

        assert!(drawn[14].contains(" loss "), "{drawn:#?}");
        assert!(!drawn[14].contains(" map "), "{drawn:#?}");
        // The chart has the room the map would have taken, so its
        // per-family footer fits.
        assert!(drawn[22].contains("semantic 0.013"), "{drawn:#?}");
    }

    #[test]
    fn a_landmark_colors_the_cell_it_lands_in() {
        let buffer = buffer_on(&placed(), 0, 120, 30);
        let colors: Vec<Color> = buffer
            .content()
            .iter()
            .filter(|cell| cell.symbol().chars().all(is_dot))
            .map(|cell| cell.fg)
            .collect();

        // The skeleton is drawn after the interior, so a cell holding a
        // landmark reads as skeleton and the rest as the sample. Both
        // colors are present: the map distinguishes them.
        assert!(colors.contains(&SKELETON), "{colors:?}");
        assert!(colors.contains(&ACCENT), "{colors:?}");
    }

    #[expect(
        clippy::float_cmp,
        reason = "the squaring is exact arithmetic over the fixture's own extent"
    )]
    #[test]
    fn the_map_keeps_the_placement_square() {
        let inner = Rect::new(0, 0, 40, 7);

        // A braille dot is as tall as it is wide, so equal data units
        // per dot on both axes is what keeps the atlas its own shape
        // instead of one stretched to fill the frame. Whichever axis
        // needs the most units per dot sets the scale, so the other one
        // gets slack and the placement always fits: asserted from both
        // sides, because a scale read off one axis alone is square too
        // and lets the other axis run off the frame.
        for placement in [
            [Vec2::new(-8.0, -1.0), Vec2::new(8.0, 1.0)],
            [Vec2::new(-0.5, -12.0), Vec2::new(0.5, 12.0)],
        ] {
            let [horizontal, vertical] = map_bounds(&placement, inner);

            let across = (horizontal[1] - horizontal[0]) / (f64::from(inner.width) * 2.0);
            let down = (vertical[1] - vertical[0]) / (f64::from(inner.height) * 4.0);
            assert_eq!(across, down, "{horizontal:?} {vertical:?}");
            for point in placement {
                assert!(
                    horizontal[0] < f64::from(point.x()) && f64::from(point.x()) < horizontal[1],
                    "{horizontal:?}"
                );
                assert!(
                    vertical[0] < f64::from(point.y()) && f64::from(point.y()) < vertical[1],
                    "{vertical:?}"
                );
            }
        }
    }

    #[test]
    fn a_row_the_canvas_cannot_place_is_dropped_rather_than_drawn() {
        let mut state = training(150, 600);
        let mut positions = placement();
        positions.push(Vec2::new(f32::NAN, 0.0));
        state.place_projector(&positions, 2);

        let drawn = draw_on(&state, 0, 120, 30);
        let placeable = draw_on(&placed(), 0, 120, 30);

        // The canvas clamps what it cannot compare into the corner of
        // the frame, which would draw a row somewhere it is not.
        assert_eq!(drawn[15..22], placeable[15..22], "{drawn:#?}");
    }

    #[test]
    fn a_placement_with_no_extent_still_has_a_viewport() {
        let inner = Rect::new(0, 0, 40, 7);

        // A collapsed placement and a frame with nothing finite in it
        // both draw a box rather than a degenerate one.
        let [horizontal, vertical] = map_bounds(&[Vec2::new(3.0, 3.0); 4], inner);
        assert!(horizontal[0] < horizontal[1], "{horizontal:?}");
        assert!(vertical[0] < vertical[1], "{vertical:?}");

        let [horizontal, vertical] = map_bounds(&[Vec2::new(f32::NAN, 0.0)], inner);
        assert!(horizontal[0] < horizontal[1], "{horizontal:?}");
        assert!(vertical[0] < vertical[1], "{vertical:?}");
    }

    #[test]
    fn a_pane_too_short_for_a_chart_keeps_the_rail_and_the_log() {
        let drawn = draw(&training(150, 600), 0);
        let pane = drawn.join("\n");

        // The rail is the run's shape and the log is its voice; the
        // chart is the first thing to go.
        assert!(!pane.contains(" loss "), "{pane}");
        assert!(pane.contains("admission"), "{pane}");
        assert!(pane.contains(" log "), "{pane}");
    }

    #[expect(
        clippy::float_cmp,
        reason = "the bounds are exactly the fixture's own values and its exact widening"
    )]
    #[test]
    fn a_flat_curve_still_has_a_plot_to_sit_in() {
        assert_eq!(value_bounds([3.0, 1.0, 2.0]), [1.0, 3.0]);
        assert_eq!(value_bounds([2.0, 2.0]), [1.5, 2.5]);
        assert_eq!(value_bounds([f64::NAN]), [0.0, 1.0]);
        assert_eq!(value_bounds([]), [0.0, 1.0]);
    }

    #[test]
    fn the_log_pane_shows_the_newest_lines_that_fit() {
        let mut state = RunState::new();
        for line in 0..40 {
            state.push_log(format!("INFO line {line}"));
        }

        let drawn = draw(&state, 0);
        let pane = drawn[15..].join("\n");

        // The pane is a tail, not a scrollback: the newest line is
        // always visible and the oldest is dropped off the top.
        assert!(pane.contains("line 39"), "{pane}");
        assert!(!pane.contains("line 0 "), "{pane}");
    }

    #[test]
    fn spans_read_as_a_clock() {
        assert_eq!(duration(Duration::from_millis(400)), "0.4s");
        assert_eq!(duration(Duration::from_millis(12_400)), "12.4s");
        assert_eq!(duration(Duration::from_secs(59)), "59.0s");
        assert_eq!(duration(Duration::from_millis(64_200)), "1m 04.2s");
        assert_eq!(duration(Duration::from_secs(3_600)), "60m 00.0s");
    }
}
