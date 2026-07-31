//! The loss chart: the placement's composite objective against the schedule it is descending.
//!
//! The chart is the shape of the descent rather than a table of it - braille resolution, no step
//! labels, and the exact current value on the frame's own title. Its axes are read off the same
//! points it plots, so the frame cannot claim a range the curve does not occupy.

use ratatui::{
    Frame,
    layout::Rect,
    style::{Style, Stylize as _},
    symbols::Marker,
    text::{Line, Span},
    widgets::{Axis, Block, BorderType, Chart, Dataset, GraphType, Padding},
};

use super::ACCENT;
use crate::cli::tui::state::ProjectorTraining;

/// Draws the placement's descent: the composite objective against the schedule's step axis.
///
/// The curve is drawn at braille resolution, so a pane sixty columns wide resolves a hundred and
/// twenty steps of a schedule that is usually longer - the chart is the shape of the descent, and
/// the exact current value rides the frame's title.
pub(super) fn render_loss(frame: &mut Frame, area: Rect, training: &ProjectorTraining) {
    // `Dataset::data` borrows a slice, so the curve is materialized once
    // per frame and read twice: for the plot, and for its value axis.
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

/// The retained losses as the chart's own coordinates.
///
/// A point is `(step, loss)` in the widget's coordinate type: the step axis counts offsets into the
/// retained window, which the axis draws unlabelled, and the loss is the `f32` the run reported,
/// widened exactly.
pub(super) fn curve(training: &ProjectorTraining) -> impl IntoIterator<Item = (f64, f64)> {
    (0_u32..)
        .zip(&training.losses)
        .map(|(offset, &loss)| (f64::from(offset), f64::from(loss)))
}

/// The chart's value axis: the objective's floor up to the highest loss observed.
///
/// Every loss family is non-negative, so zero is where the composite objective is heading and the
/// curve's height on the frame reads as the distance still to go. The top label is a loss the run
/// actually reached, never a padded bound above it; a window with nothing positive in it yet gets a
/// unit axis to sit in.
pub(super) fn value_bounds(values: impl IntoIterator<Item = f64>) -> [f64; 2] {
    let high = values
        .into_iter()
        .filter(|value| value.is_finite())
        .fold(0.0_f64, f64::max);

    if high > 0.0 { [0.0, high] } else { [0.0, 1.0] }
}

/// The chart's step axis: the retained window, never narrower than one step.
///
/// The right edge is the last point's own coordinate, so the axis and the curve cannot disagree
/// about where the descent ends.
pub(super) fn step_bounds(training: &ProjectorTraining) -> [f64; 2] {
    let last = curve(training)
        .into_iter()
        .map(|(step, _)| step)
        .last()
        .unwrap_or_default();

    [0.0, last.max(1.0)]
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
