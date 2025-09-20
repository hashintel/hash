use alloc::borrow::Cow;
use core::fmt::Display;

use annotate_snippets::Message;
use anstyle::{Color, Style};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Note {
    message: Cow<'static, str>,
    #[cfg_attr(feature = "serde", serde(skip))] // TODO: implement
    style: Option<Style>,
}

impl Note {
    pub fn new(message: impl Into<Cow<'static, str>>) -> Self {
        Self {
            message: message.into(),
            style: None,
        }
    }

    #[must_use]
    pub const fn from_static(message: &'static str) -> Self {
        Self {
            message: Cow::Borrowed(message),
            style: None,
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
    pub fn with_color(mut self, color: Color) -> Self {
        let style = self.style.get_or_insert_default();
        style.fg_color(Some(color));
        self
    }

    pub fn set_color(&mut self, color: Color) -> &mut Self {
        let style = self.style.get_or_insert_default();
        style.fg_color(Some(color));
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

    #[cfg(feature = "render")]
    pub(crate) fn as_message(&self) -> Message {
        use annotate_snippets::Level;

        let Some(style) = self.style else {
            return Level::NOTE.message(&*self.message);
        };

        Level::NOTE.message(format!("{style}{}{style:#}", self.message))
    }
}
