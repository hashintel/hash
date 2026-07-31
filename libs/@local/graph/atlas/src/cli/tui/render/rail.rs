//! The stage rail: one row per pipeline stage, with the run's clock and its completion bar.
//!
//! The rail is the run's whole shape from the first frame - every stage is listed before any of
//! them has happened, so the pane reads as remaining work rather than as a growing log. A running
//! stage carries the counter of whatever it is counting; a finished one trades that counter for
//! its span.
//!
//! The admission probe's readings hang under the rail as its one detail block. A running stage's
//! counter goes away the moment that stage finishes, while the battery's readings are the numbers
//! the run answers for, so they stay for the frames that follow, the last frame of the run
//! included. Posterity is still the report the run writes. These rows are the operator's live copy
//! of the numbers behind its verdict.
#![expect(
    clippy::non_ascii_literal,
    reason = "the dashboard's glyphs are its rendering vocabulary"
)]

use core::{num::NonZero, time::Duration};

use ratatui::{
    Frame,
    layout::Rect,
    style::{Color, Style, Stylize as _},
    symbols::{block, shade},
    text::{Line, Span},
    widgets::{Block, BorderType, Padding, Paragraph},
};

use super::ACCENT;
use crate::{
    cli::tui::state::{
        ClassifierFolds, EmbeddingWorkload, KnnActivity, ProjectorTraining, RunState, StageStatus,
    },
    progress::{Batch, Stage},
};

/// Frames of the running stage's spinner, in braille.
const SPINNER: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/// The rail's label column: the widest stage label, and the space that separates it from what
/// follows.
const LABEL_WIDTH: usize = {
    let mut widest = 0;
    let mut index = 0;
    while index < Stage::ALL.len() {
        let label = Stage::ALL[index].label().len();
        if label > widest {
            widest = label;
        }
        index += 1;
    }

    widest + 1
};

/// Cells of the rail's completion bar: one per stage, so the bar needs no scaling.
const BAR_WIDTH: usize = Stage::ALL.len();

/// Cells of a stage counter's bar, narrow enough to leave the row its leader dots.
const COUNTER_WIDTH: usize = 8;

/// Draws the stage rail: one row per pipeline stage, with the run's clock in the frame.
pub(super) fn render_rail(
    frame: &mut Frame,
    area: Rect,
    state: &RunState,
    elapsed: Duration,
    tick: usize,
) {
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
        let label = stage.label();
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
            // A stage the run has not reached says only its name: the quiet rows are the remaining
            // work.
            StageStatus::Pending => Line::from(vec![
                Span::from("· ").dim(),
                Span::from(label).fg(Color::DarkGray),
            ]),
        });
    }

    // The readings the admission probe reported, under the stage that reported them. The probe
    // reports the whole battery in one burst as its report reduces the rungs, so the rows arrive
    // together. The composition decides whether the rail has the room for them, and a frame
    // shorter than the rail asked for drops the lines it cannot hold from the bottom.
    rows.extend(
        state
            .quality()
            .map(|(metric, reading)| reading_row(metric.label(), reading, width)),
    );

    frame.render_widget(Paragraph::new(rows), inner);
}

/// Composes one admission reading row, its reading right-aligned under the stage spans.
///
/// Indented under the stage that measured it, and dim where a stage row is bold, because a reading
/// is the admission stage's detail rather than a stage of its own.
fn reading_row(label: &str, reading: f64, width: usize) -> Line<'static> {
    let value = format!("{reading:.4}");
    // Room for the indent, the label, the reading, and a space
    // either side of the dots. The rest of the row takes dots.
    let used = 4 + label.len() + value.len();
    let dots = width.saturating_sub(used);

    Line::from(vec![
        Span::from(format!("  {label}")).dim(),
        Span::from(format!(" {}", "·".repeat(dots))).fg(Color::DarkGray),
        Span::from(format!(" {value}")).fg(ACCENT),
    ])
}

/// Composes one timed stage row: glyph, label, leader dots, and the span, right-aligned.
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
    let (counter, counter_width) = counter.map_or((None, 0), |text| {
        (
            Some(Span::from(format!(" {text}")).fg(ACCENT)),
            text.chars().count() + 1,
        )
    });

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
        Stage::Classifier => run
            .classifier()
            .map(|folds| classifier_counter(folds, run.classifier_regularization()))
            .or_else(|| {
                run.assembly_boundary()
                    .map(|epsilon| format!("ε {epsilon:.2e}"))
            }),
        Stage::Knn => run.knn().map(knn_counter),
        Stage::Policy
        | Stage::Adjacency
        | Stage::Relations
        | Stage::Semantic
        | Stage::Landmarks
        | Stage::Lod
        | Stage::Seal
        | Stage::Admission => None,
        Stage::Projector => run.projector().map(projector_counter),
    }
}

/// The neighbour-table counter: whichever part of the construction reported last.
///
/// The stage runs a batched loop, then a phase the backend names, then a loop again, then its
/// verdict, so the row carries whichever of those the construction is inside - one counter for a
/// stage that counts four different things.
fn knn_counter(activity: &KnnActivity) -> String {
    match activity {
        KnnActivity::Inserting(batch) => batch_counter(*batch, "inserted"),
        KnnActivity::Building(phase) => phase.clone(),
        KnnActivity::Descending(iteration) => format!(
            "descent {} {:.4} -> {:.4}",
            iteration.iteration, iteration.accepted_per_entry, iteration.threshold,
        ),
        KnnActivity::Reading(batch) => batch_counter(*batch, "read"),
        KnnActivity::Measured(check) => format!("recall {:.4}", check.recall()),
    }
}

/// One batched loop's counter: its position as a bar, and what the covered rows did.
///
/// The two loops of a construction count rows to the same total, so each says which one it is.
fn batch_counter(batch: Batch, covered: &str) -> String {
    let Some(total) = NonZero::new(batch.total) else {
        return String::new();
    };

    format!(
        "{} {}/{total} {covered}",
        counter_bar(batch.done, total),
        batch.done,
    )
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

/// The classifier counter: folds landed as a bar, and the selected strength once chosen.
fn classifier_counter(folds: ClassifierFolds, regularization: Option<f64>) -> String {
    let Some(total) = NonZero::new(folds.total) else {
        return String::new();
    };

    let strength = regularization.map_or_else(String::new, |value| format!(" λ {value}"));
    format!(
        "{} {}/{total} folds{strength}",
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
///
/// Cells of a text row, not a [`ratatui::widgets::Gauge`]: a gauge owns a rectangle, and a counter
/// shares its row with the stage's name, its numbers, and the leader dots.
#[expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "a cell lights once its whole share of the workload is covered, so the truncation is \
              the reading"
)]
fn counter_bar(done: usize, total: NonZero<usize>) -> String {
    let filled = (done * COUNTER_WIDTH / total.get()).min(COUNTER_WIDTH);

    format!(
        "{}{}",
        block::FULL.repeat(filled),
        shade::LIGHT.repeat(COUNTER_WIDTH - filled)
    )
}

/// The rail's completion bar: filled blocks over the stages still to come.
///
/// A [`Line`], because it is drawn as the rail frame's own bottom title.
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
        Span::from(block::FULL.repeat(filled)).fg(color),
        Span::from(shade::LIGHT.repeat(BAR_WIDTH.saturating_sub(filled))).fg(Color::DarkGray),
        Span::from(" "),
    ])
}

/// Renders one span the way an operator reads a clock: seconds under a minute, then minutes.
pub(super) fn duration(span: Duration) -> String {
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
