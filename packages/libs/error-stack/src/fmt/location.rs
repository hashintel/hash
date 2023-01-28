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
    #[cfg(feature = "color")]
    mode: ColorMode,
}

impl<'a> LocationDisplay<'a> {
    // rust is likely to just remove this anyway, but as this is an internal only API having the
    // color mode always present makes it easier to work with.
    #[allow(unused)]
    #[must_use]
    pub(super) const fn new(location: &'a Location<'static>, mode: ColorMode) -> Self {
        Self {
            location,
            #[cfg(feature = "color")]
            mode,
        }
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

        #[cfg(not(feature = "color"))]
        f.write_fmt(format_args!("at {location}"))?;

        Ok(())
    }
}
