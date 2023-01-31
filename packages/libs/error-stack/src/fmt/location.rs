use core::{
    fmt,
    fmt::{Display, Formatter},
    panic::Location,
};

use crate::fmt::{
    color::{Color, DisplayStyle, Style},
    ColorMode,
};

pub(super) struct LocationDisplay<'a> {
    location: &'a Location<'static>,
    mode: ColorMode,
}

impl<'a> LocationDisplay<'a> {
    #[must_use]
    pub(super) const fn new(location: &'a Location<'static>, mode: ColorMode) -> Self {
        Self { location, mode }
    }
}

impl<'a> Display for LocationDisplay<'a> {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let location = self.location;

        let mut style = Style::new();

        match self.mode {
            ColorMode::None => {}
            ColorMode::Color => style.set_foreground(Color::Black, true),
            ColorMode::Emphasis => style.set_display(DisplayStyle::new().with_italic(true)),
        };

        f.write_fmt(format_args!("at {}", style.apply(&location)))?;

        Ok(())
    }
}
