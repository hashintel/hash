use hashql_diagnostics::color::{AnsiColor, Color, Style};

pub(crate) const CYAN: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Cyan)));
pub(crate) const BLUE: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Blue)));
pub(crate) const RED: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Red)));
pub(crate) const GREEN: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Green)));
pub(crate) const YELLOW: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Yellow)));
pub(crate) const MAGENTA: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Magenta)));
pub(crate) const GRAY: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::BrightBlack)));

pub(crate) const BOLD: Style = Style::new().bold();
pub(crate) const DIM: Style = Style::new().dimmed();
