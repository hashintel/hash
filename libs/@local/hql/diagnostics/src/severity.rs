use alloc::borrow::Cow;
use core::fmt::Display;

use anstyle::{Ansi256Color, AnsiColor, Color};

/// Severity of a diagnostic.
///
/// Indicates the severity of a diagnostic, such as an error or warning.
///
/// A severity can be referred to by its `id` or `code`.
///
/// Any code over `400` is considered fatal.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", cfg_eval, serde_with::serde_as)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Severity<'a> {
    /// Unique identifier of the severity.
    id: Cow<'a, str>,

    /// Priority code of the severity.
    ///
    /// Higher priority codes indicate more severe diagnostics.
    ///
    /// Any code over 400 is considered fatal, and should stop program execution.
    code: u16,

    /// Human-readable name of the severity.
    name: Cow<'a, str>,

    /// Color of the severity.
    ///
    /// Should be used to colorize the severity in any human readable output.
    #[cfg_attr(feature = "serde", serde_as(as = "crate::encoding::Color"))]
    color: Color,
}

// the impl is split into multiple blocks because of rustfmt reordering. The severity values are
// always descending.
impl Severity<'static> {
    pub const CRITICAL: &Self = &Self {
        id: Cow::Borrowed("critical"),
        code: 500,

        name: Cow::Borrowed("Critical"),
        color: Color::Ansi(AnsiColor::Red),
    };
    pub const ERROR: &Self = &Self {
        id: Cow::Borrowed("error"),
        code: 400,

        name: Cow::Borrowed("Error"),
        color: Color::Ansi(AnsiColor::Red),
    };
    pub const WARNING: &Self = &Self {
        id: Cow::Borrowed("warning"),
        code: 300,

        name: Cow::Borrowed("Warning"),
        color: Color::Ansi(AnsiColor::Yellow),
    };
}

impl Severity<'static> {
    pub const INFO: &Self = &Self {
        id: Cow::Borrowed("note"),
        code: 200,

        name: Cow::Borrowed("Note"),
        color: Color::Ansi256(Ansi256Color(147)),
    };
}

impl Severity<'static> {
    pub const DEBUG: &Self = &Self {
        id: Cow::Borrowed("debug"),
        code: 100,

        name: Cow::Borrowed("Debug"),
        color: Color::Ansi256(Ansi256Color(39)),
    };
}

impl Severity<'_> {
    #[must_use]
    pub fn id(&self) -> &str {
        &self.id
    }

    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    #[must_use]
    pub const fn code(&self) -> u16 {
        self.code
    }

    #[must_use]
    pub const fn is_fatal(&self) -> bool {
        self.code >= 400
    }

    pub(crate) fn kind(&self) -> ariadne::ReportKind {
        ariadne::ReportKind::Custom(&self.name, anstyle_yansi::to_yansi_color(self.color))
    }
}

impl Display for Severity<'_> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        Display::fmt(&self.name, f)
    }
}

impl<'a> From<Severity<'a>> for Cow<'a, Severity<'a>> {
    fn from(severity: Severity<'a>) -> Self {
        Cow::Owned(severity)
    }
}

impl<'a> From<&'a Severity<'a>> for Cow<'a, Severity<'a>> {
    fn from(severity: &'a Severity<'a>) -> Self {
        Cow::Borrowed(severity)
    }
}
