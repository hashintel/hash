use alloc::borrow::Cow;
use core::fmt::Display;

use anstyle::Color;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Note {
    message: Cow<'static, str>,
    #[cfg_attr(feature = "serde", serde(with = "crate::encoding::color_option"))]
    color: Option<Color>,
}

impl Note {
    pub fn new(message: impl Into<Cow<'static, str>>) -> Self {
        Self {
            message: message.into(),
            color: None,
        }
    }

    #[must_use]
    pub const fn new_const(message: &'static str) -> Self {
        Self {
            message: Cow::Borrowed(message),
            color: None,
        }
    }

    #[must_use]
    pub const fn message(&self) -> &str {
        // We cannot use `&self.message`, because that wouldn't be `const`
        match &self.message {
            Cow::Borrowed(message) => message,
            Cow::Owned(message) => message.as_str(),
        }
    }

    #[must_use]
    pub const fn with_color(mut self, color: Color) -> Self {
        self.color = Some(color);
        self
    }

    pub const fn set_color(&mut self, color: Color) -> &mut Self {
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
            fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                Display::fmt(&self.style.render(), fmt)?;
                Display::fmt(self.message, fmt)?;
                Display::fmt(&self.style.render_reset(), fmt)
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
