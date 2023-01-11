use alloc::string::{String, ToString};
use core::panic::Location;

use owo_colors::{OwoColorize, Stream};

pub(super) struct LocationDisplay<'a> {
    location: &'a Location<'static>,
    supports_color: bool,
}

impl<'a> LocationDisplay<'a> {
    #[must_use]
    pub(super) const fn new(location: &'a Location<'static>) -> Self {
        Self {
            location,
            supports_color: false,
        }
    }

    pub(super) fn render(self) -> String {
        let body = self.if_supports_color(Stream::Stdout, |value| LocationDisplay {
            location: value.location,
            supports_color: true,
        });

        body.to_string()
    }
}

impl<'a> core::fmt::Display for LocationDisplay<'a> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let location = self.location;

        if self.supports_color {
            core::fmt::Display::fmt(&OwoColorize::bright_black(location), f)
        } else {
            f.write_fmt(format_args!("at {location}"))
        }
    }
}
