use core::fmt::Display;

use ariadne::Color;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", cfg_eval, serde_with::serde_as)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Severity {
    id: &'static str,
    name: &'static str,

    priority: i32,

    #[cfg_attr(feature = "serde", serde_as(as = "crate::encoding::Color"))]
    color: Color,
}

impl Severity {
    pub const CRITICAL: Self = Self {
        id: "critical",
        name: "Critical",
        priority: 0,

        color: Color::Red,
    };
    pub const ERROR: Self = Self {
        id: "error",
        name: "Error",
        priority: 1,

        color: Color::Red,
    };
    pub const WARNING: Self = Self {
        id: "warning",
        name: "Warning",
        priority: 2,

        color: Color::Yellow,
    };
}

impl Severity {
    pub const ADVICE: Self = Self {
        id: "note",
        name: "Note",
        priority: 400,

        color: Color::Fixed(147),
    };
}

impl Severity {
    #[must_use]
    pub const fn id(&self) -> &str {
        self.id
    }

    #[must_use]
    pub const fn name(&self) -> &str {
        self.name
    }

    #[must_use]
    pub const fn code(&self) -> i32 {
        self.priority
    }
}

impl Display for Severity {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        Display::fmt(self.name, f)
    }
}
