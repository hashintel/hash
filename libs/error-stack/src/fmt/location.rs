use core::{fmt, panic::Location};

use crate::fmt::color::{Color, ColorMode, DisplayStyle, Style};

pub(super) struct LocationAttachment<'a, 'loc> {
    location: &'a Location<'loc>,
    mode: ColorMode,
}

impl<'a, 'loc> LocationAttachment<'a, 'loc> {
    #[must_use]
    pub(super) const fn new(location: &'a Location<'loc>, mode: ColorMode) -> Self {
        Self { location, mode }
    }
}

impl fmt::Display for LocationAttachment<'_, '_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let location = self.location;

        let mut style = Style::new();

        match self.mode {
            ColorMode::None => {}
            ColorMode::Color => style.set_foreground(Color::Black, true),
            ColorMode::Emphasis => style.set_display(DisplayStyle::new().with_italic(true)),
        };

        fmt.write_fmt(format_args!("at {}", style.apply(&location)))?;

        Ok(())
    }
}
