use core::{
    fmt,
    fmt::{Display, Formatter},
    panic::Location,
};

#[cfg(feature = "pretty-print")]
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

        match self.mode {
            ColorMode::None => f.write_fmt(format_args!("at {location}")),
            #[cfg(feature = "pretty-print")]
            ColorMode::Color => Display::fmt(&(*location).bright_black(), f),
            #[cfg(feature = "pretty-print")]
            ColorMode::Emphasis => Display::fmt(&(*location).italic(), f),
        }
    }
}
