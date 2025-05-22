use core::{fmt::Display, mem};

use anstyle::Color;

use crate::{Help, Note};

#[cfg(feature = "serde")]
#[derive(Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
#[expect(unused, reason = "required for `deny_unknown_fields")]
struct OwnedSeverityInfo {
    id: String,
    code: u16,
    name: String,
    description: String,
    #[serde(with = "crate::encoding::color")]
    color: Color,
}

/// Internal information about a severity level.
///
/// This struct contains all the static information associated with a
/// severity level, including its identifier, code, name, description, and display color.
/// It provides the backing data for the public [`Severity`] enum.
///
/// The information in this struct is used to provide consistent metadata across
/// all severity levels and is not intended to be used directly by consumers.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
#[cfg_attr(feature = "serde", serde(deny_unknown_fields))]
pub struct SeverityInfo {
    /// Unique (human readable) identifier of the severity.
    pub id: &'static str,
    /// Unique numeric code of the severity.
    ///
    /// Higher codes indicate more severe diagnostics. Any code >= `400` is considered fatal.
    pub code: u16,
    /// Human-readable name of the severity.
    pub name: &'static str,
    /// Human-readable description of the severity.
    pub description: &'static str,
    /// Color used to display the severity.
    ///
    /// Should be used to colorize the severity in any human readable output.
    // default color is fine here as during deserialization we only care about the id and none of
    // the other fields
    #[cfg_attr(feature = "serde", serde(with = "crate::encoding::color"))]
    pub color: Color,
}

/// Severity of a diagnostic.
///
/// Indicates the severity of a diagnostic, such as an error or warning.
/// Severity levels are ordered by their importance:
///
/// | Variant  | Code | Identifier | Description                   |
/// |----------|------|------------|-------------------------------|
/// | `Bug`    | 600  | `"ice"`    | Internal compiler error       |
/// | `Fatal`  | 500  | `"fatal"`  | Immediate abort               |
/// | `Error`  | 400  | `"error"`  | Prevents compilation          |
/// | `Warning`| 300  | `"warning"`| Potential issues              |
/// | `Note`   | 200  | `"note"`   | Additional information        |
/// | `Debug`  | 100  | `"debug"`  | Low-level debug information   |
///
/// Any severity level with code >= `400` (i.e., `Error`, `Fatal`, or `Bug`) is considered
/// fatal and should stop program execution.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::Severity;
///
/// // Fatal severity levels
/// let bug = Severity::Bug; // Code: 600
/// let fatal = Severity::Fatal; // Code: 500
/// let error = Severity::Error; // Code: 400
/// assert!(bug.is_fatal());
/// assert!(fatal.is_fatal());
/// assert!(error.is_fatal());
///
/// // Non-fatal severity levels
/// let warning = Severity::Warning; // Code: 300
/// let note = Severity::Note; // Code: 200
/// let debug = Severity::Debug; // Code: 100
/// assert!(!warning.is_fatal());
/// assert!(!note.is_fatal());
/// assert!(!debug.is_fatal());
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Severity {
    /// For bugs in the compiler. Manifests as an ICE (internal compiler error).
    ///
    /// These represent problems in the compiler itself, not in the code being compiled.
    ///
    /// * Code: `600`
    /// * Identifier: `"ice"`
    /// * Display name: `"Internal Compiler Error"`
    /// * Color: Red
    Bug,

    /// An error that causes an immediate abort, such as configuration errors.
    ///
    /// These errors prevent any further processing.
    ///
    /// * Code: `500`
    /// * Identifier: `"fatal"`
    /// * Display name: `"Fatal"`
    /// * Color: Red
    Fatal,

    /// An error in the code being compiled, which prevents compilation from finishing.
    ///
    /// These are problems in the source code that make it impossible to produce a valid output.
    ///
    /// * Code: `400`
    /// * Identifier: `"error"`
    /// * Display name: `"Error"`
    /// * Color: Red
    Error,

    /// A warning about the code being compiled. Does not prevent compilation from finishing.
    ///
    /// These indicate potential problems or code smells that should be addressed but don't
    /// prevent successful compilation.
    ///
    /// * Code: `300`
    /// * Identifier: `"warning"`
    /// * Display name: `"Warning"`
    /// * Color: Yellow
    Warning,

    /// A note about the code being compiled. Does not prevent compilation from finishing.
    ///
    /// These provide additional information about the code being compiled.
    /// Often used alongside other diagnostic messages to provide context.
    ///
    /// * Code: `200`
    /// * Identifier: `"note"`
    /// * Display name: `"Note"`
    /// * Color: Purple (Ansi256 color 147)
    Note,

    /// A debug message about the code being compiled. Does not prevent compilation from finishing.
    ///
    /// These provide low-level information that is typically only useful for debugging
    /// the compiler itself.
    ///
    /// * Code: `100`
    /// * Identifier: `"debug"`
    /// * Display name: `"Debug"`
    /// * Color: Blue (Ansi256 color 39)
    Debug,
}

impl Severity {
    #[must_use]
    pub const fn variants() -> &'static [Self] {
        const LEN: usize = mem::variant_count::<Severity>();
        const VARIANTS: [Severity; LEN] = [
            Severity::Bug,
            Severity::Fatal,
            Severity::Error,
            Severity::Warning,
            Severity::Note,
            Severity::Debug,
        ];

        const {
            // assert that the variants are in the correct order
            let mut index = 0;

            while index < LEN {
                let variant = VARIANTS[index] as usize;

                assert!(
                    variant == index,
                    "Expected consistent ordering between variant and index"
                );

                index += 1;
            }
        }

        &VARIANTS
    }

    /// Returns static information about this severity level.
    ///
    /// This method provides access to the identifier, code, name, description, and display color
    /// associated with this severity level.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Severity;
    ///
    /// let error = Severity::Error;
    /// let info = error.info();
    ///
    /// assert_eq!(info.id, "error");
    /// assert_eq!(info.code, 400);
    /// assert_eq!(info.name, "Error");
    /// ```
    #[must_use]
    pub const fn info(self) -> &'static SeverityInfo {
        match self {
            Self::Bug => &SeverityInfo {
                id: "ice",
                code: 600,
                name: "Internal Compiler Error",
                description: "An internal compiler error, indicating a bug in the compiler itself.",
                color: Color::Ansi(anstyle::AnsiColor::Red),
            },
            Self::Fatal => &SeverityInfo {
                id: "fatal",
                code: 500,
                name: "Fatal",
                description: "A fatal error that causes an immediate abort.",
                color: Color::Ansi(anstyle::AnsiColor::Red),
            },
            Self::Error => &SeverityInfo {
                id: "error",
                code: 400,
                name: "Error",
                description: "An error that prevents compilation from finishing.",
                color: Color::Ansi(anstyle::AnsiColor::Red),
            },
            Self::Warning => &SeverityInfo {
                id: "warning",
                code: 300,
                name: "Warning",
                description: "A warning about potential issues that doesn't prevent compilation.",
                color: Color::Ansi(anstyle::AnsiColor::Yellow),
            },
            Self::Note => &SeverityInfo {
                id: "note",
                code: 200,
                name: "Note",
                description: "Additional information about the code being compiled.",
                color: Color::Ansi256(anstyle::Ansi256Color(147)),
            },
            Self::Debug => &SeverityInfo {
                id: "debug",
                code: 100,
                name: "Debug",
                description: "Low-level debugging information.",
                color: Color::Ansi256(anstyle::Ansi256Color(39)),
            },
        }
    }

    pub(crate) const fn help(self) -> &'static [Help] {
        match self {
            Self::Bug => {
                const {
                    &[
                        Help::new_const(
                            "This is a bug in the compiler, not an issue with your code.",
                        )
                        .with_color(Color::Ansi(anstyle::AnsiColor::Green)),
                        Help::new_const(
                            "Please report this issue along with a minimal code example that \
                             reproduces the error.",
                        )
                        .with_color(Color::Ansi(anstyle::AnsiColor::Blue)),
                    ] as &[_]
                }
            }
            _ => &[],
        }
    }

    pub(crate) const fn notes(self) -> &'static [Note] {
        match self {
            Self::Bug => {
                const {
                    // TODO: in the future we might want to include a link to create the issue
                    // directly
                    &[Note::new_const(
                        "Internal compiler errors indicate a bug in the compiler itself that \
                         needs to be fixed.\n\nWe would appreciate if you could file a GitHub or \
                         Linear issue and reference this error.\n\nWhen reporting this issue, \
                         please include your query, any relevant type definitions, and the \
                         complete error message shown above.",
                    )] as &[_]
                }
            }
            _ => &[],
        }
    }

    /// Returns the unique identifier for this severity level.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Severity;
    ///
    /// assert_eq!(Severity::Error.id(), "error");
    /// assert_eq!(Severity::Warning.id(), "warning");
    /// assert_eq!(Severity::Note.id(), "note");
    /// ```
    #[must_use]
    pub const fn id(self) -> &'static str {
        self.info().id
    }

    /// Returns the numeric code for this severity level.
    ///
    /// Higher codes indicate more severe diagnostics.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Severity;
    ///
    /// assert_eq!(Severity::Bug.code(), 600);
    /// assert_eq!(Severity::Error.code(), 400);
    /// assert_eq!(Severity::Warning.code(), 300);
    /// ```
    #[must_use]
    pub const fn code(self) -> u16 {
        self.info().code
    }

    /// Returns the human-readable name for this severity level.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Severity;
    ///
    /// assert_eq!(Severity::Error.name(), "Error");
    /// assert_eq!(Severity::Warning.name(), "Warning");
    /// assert_eq!(Severity::Bug.name(), "Internal Compiler Error");
    /// ```
    #[must_use]
    pub const fn name(self) -> &'static str {
        self.info().name
    }

    /// Returns whether this severity level is fatal.
    ///
    /// A severity is considered fatal if its code is >= 400.
    /// Fatal severities are `Error`, `Fatal`, and `Bug`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Severity;
    ///
    /// // Fatal severities
    /// assert!(Severity::Bug.is_fatal());
    /// assert!(Severity::Fatal.is_fatal());
    /// assert!(Severity::Error.is_fatal());
    ///
    /// // Non-fatal severities
    /// assert!(!Severity::Warning.is_fatal());
    /// assert!(!Severity::Note.is_fatal());
    /// assert!(!Severity::Debug.is_fatal());
    /// ```
    #[must_use]
    pub const fn is_fatal(self) -> bool {
        self.code() >= 400
    }

    /// Returns the display color for this severity level.
    ///
    /// # Examples
    ///
    /// ```
    /// use anstyle::Color;
    /// use hashql_diagnostics::Severity;
    ///
    /// let error_color = Severity::Error.color();
    /// let warning_color = Severity::Warning.color();
    /// ```
    #[must_use]
    pub const fn color(self) -> Color {
        self.info().color
    }

    pub(crate) fn kind(self) -> ariadne::ReportKind<'static> {
        ariadne::ReportKind::Custom(self.name(), anstyle_yansi::to_yansi_color(self.color()))
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for Severity {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.info().serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for Severity {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let info = OwnedSeverityInfo::deserialize(deserializer)?;

        for severity in Self::variants() {
            if severity.code() == info.code {
                return Ok(*severity);
            }
        }

        Err(serde::de::Error::custom("invalid severity code"))
    }
}

impl Display for Severity {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        Display::fmt(self.name(), fmt)
    }
}
