//! Drawing one frame of the dashboard: the stage rail, the loss chart beside the placement map,
//! and the log pane.
//!
//! [`frame`] is a pure function of the model plus the tick that animates the running stage, so a
//! frame is reproducible: the same [`RunState`] and tick draw the same cells. Every glyph choice,
//! label, and color lives in this module tree - the model carries no presentation, and the
//! pipeline's [`Stage`] carries no prose.
//!
//! One module per pane - [`rail`], [`loss`], [`map`], [`log`] - each owning the vocabulary it
//! draws with. This module owns the composition: the geometry the panes are laid out in, and which
//! of them a given terminal is large enough to earn.

use ratatui::{
    Frame,
    layout::{Constraint, Layout},
    style::Color,
};

use self::{log::render_log, loss::render_loss, map::render_map, rail::render_rail};
use super::state::RunState;
use crate::progress::Stage;

mod log;
mod loss;
mod map;
mod rail;
#[cfg(test)]
mod tests;

/// The dashboard's one accent color, carried by the running stage and the frame titles.
const ACCENT: Color = Color::Cyan;

/// Rows the stage rail always has: one per pipeline stage, plus the frame around them.
#[expect(
    clippy::cast_possible_truncation,
    reason = "the stage array has twelve elements"
)]
const RAIL_HEIGHT: u16 = Stage::ALL.len() as u16 + 2;

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

/// Dots a braille cell holds across.
const DOTS_ACROSS: u16 = 2;

/// Dots a braille cell holds down.
const DOTS_DOWN: u16 = 4;

/// Points the widest map can hold apart: its braille dot grid, two dots per column and four per
/// row inside the frame.
///
/// This is what the dashboard asks a run to sample. A larger sample would cost the run copies of
/// coordinates that land on dots already lit.
pub(super) const MAP_CAPACITY: usize = (MAP_MAXIMUM as usize - 2)
    * DOTS_ACROSS as usize
    * (LOSS_HEIGHT as usize - 2)
    * DOTS_DOWN as usize;

/// Rows the log pane keeps whatever else is on screen.
const LOG_MINIMUM: u16 = 3;

/// Draws one frame: the stage rail above, the log tail below, and between them the placement's
/// band - its loss curve, and its map once the pane is wide enough to hold both.
pub(super) fn frame(frame: &mut Frame, state: &RunState, tick: usize) {
    let elapsed = state.elapsed();
    let area = frame.area();
    let rail_rows = rail_height(state, area.height);
    let [rail, band, log] = Layout::vertical([
        Constraint::Length(rail_rows),
        Constraint::Length(band_height(state, area.height, rail_rows)),
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

/// The rows the stage rail claims, one per pipeline stage plus one per admission reading the probe
/// has reported.
///
/// The rail earns the readings whole or not at all. Half a battery under the admission stage would
/// read as evidence the probe could not measure. Only the report says that. A terminal too short
/// for a row per reading therefore draws no readings at all, and the numbers stay in the report.
fn rail_height(state: &RunState, available: u16) -> u16 {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the metric array has six elements"
    )]
    let readings = state.quality().count() as u16;
    if readings == 0 {
        return RAIL_HEIGHT;
    }

    let spare = available.saturating_sub(RAIL_HEIGHT + LOG_MINIMUM);
    if spare < readings {
        return RAIL_HEIGHT;
    }

    RAIL_HEIGHT + readings
}

/// The rows the placement's band may claim, beneath a rail of `rail` rows.
///
/// The band appears only once the placement has something to show, and it never crowds out the
/// rail or the log: the rail is the run's shape and the log is its voice, so the band takes what
/// those two leave and stays away entirely below the height where a plot says anything. Readings
/// arriving at the end of a run therefore cost the band its rows before they cost the log any. By
/// then the placement's curve has told its story, and the battery's numbers have not.
const fn band_height(state: &RunState, available: u16, rail: u16) -> u16 {
    if state.projector().is_none() && state.placement().is_none() {
        return 0;
    }

    let spare = available.saturating_sub(rail + LOG_MINIMUM);
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
