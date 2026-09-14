//! The placement's composite objective against its training steps.
//!
//! Braille resolution shows the shape of the retained loss curve without step labels. The frame
//! title gives the current total at four decimal places. The value axis begins at zero and ends at
//! the greatest positive finite retained loss, or at one when none exists.

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
/// The chart draws the curve at braille resolution: two horizontal dot positions per character
/// column of the plotting area, inside the border and padding and beside the value labels. A
/// schedule can contain more steps than the plot has horizontal dot positions. The curve shows the
/// loss trend, while the frame title reports the current total at four decimal places.
pub(super) fn render_loss(frame: &mut Frame, area: Rect, training: &ProjectorTraining) {
    // `Dataset::data` borrows a slice. This builds the curve once per frame and reads it twice: for
    // the plot, and for its value axis.
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

/// Returns the retained losses as the chart's own coordinates.
///
/// A point is `(step, loss)` in the widget's coordinate type. The step axis counts offsets into the
/// retained window, which the axis draws unlabelled. The loss is the `f32` the run reported,
/// widened exactly.
pub(super) fn curve(training: &ProjectorTraining) -> impl IntoIterator<Item = (f64, f64)> {
    (0_u32..)
        .zip(&training.losses)
        .map(|(offset, &loss)| (f64::from(offset), f64::from(loss)))
}

/// Returns a zero-based value axis with a finite upper bound.
///
/// The upper bound is the greatest positive finite input, defaulting to one when no such input
/// exists.
pub(super) fn value_bounds(values: impl IntoIterator<Item = f64>) -> [f64; 2] {
    let high = values
        .into_iter()
        .filter(|value| value.is_finite())
        .fold(0.0_f64, f64::max);

    if high > 0.0 { [0.0, high] } else { [0.0, 1.0] }
}

/// Returns the chart's step axis, spanning the retained window and never narrower than one step.
///
/// For two or more retained points, the right edge is the last point's coordinate. An empty or
/// single-point window uses the unit interval `[0, 1]`.
pub(super) fn step_bounds(training: &ProjectorTraining) -> [f64; 2] {
    let last = curve(training)
        .into_iter()
        .map(|(step, _)| step)
        .last()
        .unwrap_or_default();

    [0.0, last.max(1.0)]
}

/// Formats the last step's objective by family for the chart's footer.
///
/// Semantic attraction, ordinary repulsion, mined hard-negative repulsion and relation attraction
/// read as themselves. The footer adds the temporal anchors to the landmarks under one support
/// heading, the term they are both evaluations of. It shows those five at three decimal places,
/// while the title shows the total at four. The target objective is not among the five, and the
/// title's total covers it along with them at that different precision.
///
/// The footer is all or nothing. The widget draws a title wider than its frame over the corner. A
/// pane too narrow for the whole breakdown shows the plot and its total alone.
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
