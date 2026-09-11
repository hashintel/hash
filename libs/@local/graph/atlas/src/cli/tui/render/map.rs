//! The sampled rows as braille dots, with the landmark skeleton picked out.
//!
//! The map draws the sample the observer asked for, not the corpus, and it keeps the placement's
//! own shape: equal data units per dot on both axes, so the atlas is never stretched to fill the
//! frame. The map draws nothing it cannot place.

use ratatui::{
    Frame,
    layout::Rect,
    style::{Color, Style, Stylize as _},
    symbols::Marker,
    text::Line,
    widgets::{
        Block, BorderType,
        canvas::{Canvas, Points},
    },
};

use super::{ACCENT, DOTS_ACROSS, DOTS_DOWN};
use crate::{
    cli::tui::state::PlacementMap,
    math::{Bounds2, DVec2, Positive, Vec2},
};

/// The color of the landmark skeleton, against the accent the map draws the interior sample in.
pub(super) const SKELETON: Color = Color::Magenta;

/// How much wider than the placement the map draws its viewport.
///
/// The map carries no axis labels, so widening states nothing untrue - it only keeps the outermost
/// rows a dot inside the frame rather than against its wall.
const MAP_MARGIN: Positive = Positive::new(1.04).unwrap();

/// The viewport, in data units, that the map gives a placement with no extent of its own.
///
/// The first refresh tick of a collapsed initialization reports rows that all sit together, which
/// has a centre but no size to scale.
const MINIMUM_EXTENT: f32 = 1.0;

/// Draws the placement itself, the sampled rows as braille dots with the skeleton picked out.
///
/// The map is the run's shape becoming true - a cloud that starts as noise around the landmarks and
/// pulls itself into the atlas the fit will publish. It shows the sample the observer asked for,
/// not the corpus: at braille resolution a pane forty columns wide resolves seventy-six dots
/// across, two per column of the thirty-eight its border leaves. A few thousand points is already
/// more than the frame can separate.
pub(super) fn render_map(frame: &mut Frame, area: Rect, placement: &PlacementMap) {
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
/// This drops a non-finite coordinate rather than drawing it: the canvas clamps what it cannot
/// compare into the corner of the frame, which would report a row sitting somewhere it is not. A
/// run whose placement diverges fails in the trainer instead of arriving here.
fn drawable(positions: &[Vec2]) -> impl IntoIterator<Item = (f64, f64)> {
    positions
        .iter()
        .copied()
        .filter(|position| position.is_finite())
        .map(DVec2::from)
        .map(|position| (position.x(), position.y()))
}

/// The map's viewport, which is the placement's own extent squared against the pane's dot grid.
///
/// A braille cell is [`DOTS_ACROSS`] dots wide and [`DOTS_DOWN`] tall over a terminal cell about
/// twice as tall as it is wide, so a dot is approximately square. Equal data units per dot on both
/// axes is what keeps the atlas its own shape instead of a version stretched to fill the frame. The
/// extent grows to the grid's aspect first and then by [`MAP_MARGIN`]. A placement with no extent
/// of its own grows to [`MINIMUM_EXTENT`] instead, so its rows sit in the middle of a frame rather
/// than dividing by zero.
pub(super) fn map_bounds(positions: &[Vec2], inner: Rect) -> [[f64; 2]; 2] {
    let Some(bounds) = Bounds2::from_points(
        positions
            .iter()
            .copied()
            .filter(|position| position.is_finite()),
    ) else {
        // Nothing placeable to draw yet.
        return [[-1.0, 1.0], [-1.0, 1.0]];
    };

    let across = (f32::from(inner.width) * f32::from(DOTS_ACROSS)).max(1.0);
    let down = (f32::from(inner.height) * f32::from(DOTS_DOWN)).max(1.0);
    let aspect = Positive::new(across / down).unwrap_or(Positive::ONE);

    let viewport = bounds
        .with_minimum_extent(MINIMUM_EXTENT)
        .with_aspect_ratio(aspect)
        .scaled_about_centre(MAP_MARGIN);

    [
        [f64::from(viewport.min().x()), f64::from(viewport.max().x())],
        [f64::from(viewport.min().y()), f64::from(viewport.max().y())],
    ]
}

/// The map's footer, showing how many rows it is drawing and how many of them are the skeleton.
///
/// All or nothing, like the chart's breakdown. The widget draws a title wider than its frame over
/// the corner rather than truncating it inside.
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
