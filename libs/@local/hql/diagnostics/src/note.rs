use core::fmt::Display;

use anstyle::Color;

// See: https://docs.rs/serde_with/3.9.0/serde_with/guide/serde_as/index.html#gating-serde_as-on-features
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", cfg_eval, serde_with::serde_as)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Note {
    message: Box<str>,
    #[cfg_attr(feature = "serde", serde_as(as = "Option<crate::encoding::Color>"))]
    color: Option<Color>,
}

impl Note {
    pub fn new(message: impl Into<Box<str>>) -> Self {
        Self {
            message: message.into(),
            color: None,
        }
    }

    #[must_use]
    pub const fn with_color(mut self, color: Color) -> Self {
        self.color = Some(color);
        self
    }

    pub fn set_color(&mut self, color: Color) -> &mut Self {
        self.color = Some(color);
        self
    }

    #[must_use]
    pub(crate) fn colored(&self, enabled: bool) -> impl Display + '_ {
        struct DisplayColor<'a> {
            style: anstyle::Style,
            message: &'a str,
        }

        impl Display for DisplayColor<'_> {
            fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                Display::fmt(&self.style.render(), f)?;
                Display::fmt(self.message, f)?;
                Display::fmt(&self.style.render_reset(), f)
            }
        }

        let mut style = anstyle::Style::new();

        if enabled {
            style = style.fg_color(self.color);
        }

        DisplayColor {
            style,
            message: &self.message,
        }
    }
}
