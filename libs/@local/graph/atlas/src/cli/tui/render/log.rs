//! The log pane, showing the tail of what the run said, colored by level.
//!
//! A tail rather than a scrollback - the newest lines that fit, so the pane never scrolls away from
//! what is happening now. The level token the formatter leads with is the only thing read out of a
//! line.

use ratatui::{
    Frame,
    layout::Rect,
    style::{Color, Style, Stylize as _},
    text::{Line, Span},
    widgets::{Block, BorderType, Padding, Paragraph},
};

use crate::cli::tui::state::RunState;

/// Draws the log tail: the newest lines that fit, colored by level.
pub(super) fn render_log(frame: &mut Frame, area: Rect, state: &RunState) {
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
