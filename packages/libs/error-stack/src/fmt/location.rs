use core::{
    fmt,
    fmt::{Display, Formatter},
    panic::Location,
};

#[cfg(feature = "color")]
use owo_colors::OwoColorize;

use crate::fmt::ColorMode;

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

        #[cfg(feature = "color")]
        match self.mode {
            ColorMode::None => f.write_fmt(format_args!("at {location}")),
            ColorMode::Color => Display::fmt(&(*location).bright_black(), f),
            ColorMode::Emphasis => Display::fmt(&(*location).italic(), f),
        }?;

        f.write_fmt(format_args!("at {location}"))?;

        Ok(())
    }
}
