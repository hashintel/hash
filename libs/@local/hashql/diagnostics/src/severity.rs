use core::{
    cmp,
    fmt::{self, Display},
    mem,
};

use anstyle::Color;

use crate::diagnostic::Message;

/// Trait for types that represent diagnostic severity levels.
///
/// [`SeverityKind`] provides a common interface for working with different
/// severity representations, whether they are the general [`Severity`] enum
/// or specialized types like [`Critical`] and [`Advisory`].
///
/// The trait defines two core methods that determine the behavioral category
/// of a severity level: critical severities prevent successful compilation,
/// while advisory severities provide warnings and informational messages.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Severity, severity::SeverityKind};
///
/// // Critical severities
/// assert!(Severity::Bug.is_critical());
/// assert!(Severity::Fatal.is_critical());
/// assert!(Severity::Error.is_critical());
///
/// // Non-critical severities
/// assert!(Severity::Warning.is_advisory());
/// assert!(Severity::Note.is_advisory());
/// assert!(Severity::Debug.is_advisory());
/// ```
pub const trait SeverityKind: Copy + const Into<Severity> {
    /// Returns whether this severity level is critical.
    ///
    /// Critical severities represent issues that prevent successful compilation
    /// and require immediate attention. These correspond to severity codes >= 400.
    ///
    /// # Implementation Note
    ///
    /// This method is mutually exclusive with [`Self::is_advisory`].
    fn is_critical(self) -> bool;

    /// Returns whether this severity level is advisory.
    ///
    /// Advisory severities represent non-fatal issues like warnings, informational messages, or
    /// debugging output. These correspond to severity codes < 400.
    ///
    /// # Implementation Note
    ///
    /// This method is mutually exclusive with [`Self::is_critical`].
    fn is_advisory(self) -> bool {
        !self.is_critical()
    }
}

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

/// Static information about a severity level.
///
/// Contains all the metadata associated with a particular severity level, including its identifier,
/// numeric code, human-readable name and description, and display color. This information is used
/// throughout the diagnostic system to provide consistent presentation and behavior.
///
/// The severity code determines the behavioral category:
/// - Codes >= 400: Critical severities that prevent compilation
/// - Codes < 400: Advisory severities that provide warnings/information
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
#[cfg_attr(feature = "serde", serde(deny_unknown_fields))]
pub struct SeverityInfo {
    /// Unique string identifier of the severity level.
    ///
    /// Used for serialization and programmatic identification.
    pub id: &'static str,

    /// Numeric severity code determining priority and category.
    ///
    /// Higher codes indicate more severe issues. Codes >= 400 are considered critical and prevent
    /// successful compilation.
    pub code: u16,

    /// Human-readable display name of the severity level.
    pub name: &'static str,

    /// Detailed description explaining what this severity level represents.
    pub description: &'static str,

    /// ANSI color used for terminal display of this severity level.
    ///
    /// Should be used to colorize severity indicators in diagnostic output.
    #[cfg_attr(feature = "serde", serde(with = "crate::encoding::color"))]
    pub color: Color,
}

/// Diagnostic severity levels indicating the importance and impact of issues.
///
/// [`Severity`] represents the different levels of diagnostic messages that can be reported during
/// compilation. Each severity level has an associated numeric code, display properties, and
/// behavioral implications.
///
/// ## Severity Hierarchy
///
/// | Variant  | Code | Identifier | Critical | Description                   |
/// |----------|------|------------|----------|-------------------------------|
/// | `Bug`    | 600  | `"ice"`    | Yes      | Internal compiler error       |
/// | `Fatal`  | 500  | `"fatal"`  | Yes      | Immediate abort               |
/// | `Error`  | 400  | `"error"`  | Yes      | Prevents compilation          |
/// | `Warning`| 300  | `"warning"`| No       | Potential issues              |
/// | `Note`   | 200  | `"note"`   | No       | Additional information        |
/// | `Debug`  | 100  | `"debug"`  | No       | Low-level debug information   |
///
/// - **Critical** (code >= 400): Prevent successful compilation
/// - **Advisory** (code < 400): Provide warnings and information
///
/// # Examples
///
/// Basic usage and severity checking:
///
/// ```
/// use hashql_diagnostics::{Severity, severity::SeverityKind};
///
/// // Critical severity levels
/// let bug = Severity::Bug; // Code: 600
/// let fatal = Severity::Fatal; // Code: 500
/// let error = Severity::Error; // Code: 400
/// assert!(bug.is_critical());
/// assert!(fatal.is_critical());
/// assert!(error.is_critical());
///
/// // Non-critical severity levels
/// let warning = Severity::Warning; // Code: 300
/// let note = Severity::Note; // Code: 200
/// let debug = Severity::Debug; // Code: 100
/// assert!(!warning.is_critical());
/// assert!(!note.is_critical());
/// assert!(!debug.is_critical());
/// ```
///
/// Accessing severity metadata:
///
/// ```
/// use hashql_diagnostics::Severity;
///
/// let error = Severity::Error;
/// assert_eq!(error.id(), "error");
/// assert_eq!(error.code(), 400);
/// assert_eq!(error.name(), "Error");
/// ```
///
/// [`Bug`]: Severity::Bug
/// [`Fatal`]: Severity::Fatal
/// [`Error`]: Severity::Error
/// [`Warning`]: Severity::Warning
/// [`Note`]: Severity::Note
/// [`Debug`]: Severity::Debug
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Severity {
    /// Internal compiler error indicating a bug in the compiler itself.
    ///
    /// These represent problems in the compiler implementation rather than in the code being
    /// compiled. They manifest as ICEs (Internal Compiler Errors) and should be reported as
    /// compiler bugs.
    ///
    /// * Code: `600`
    /// * Identifier: `"ice"`
    /// * Display name: `"Internal Compiler Error"`
    /// * Color: Red
    Bug,

    /// Fatal error requiring immediate termination.
    ///
    /// Represents unrecoverable errors where the compiler cannot continue processing. These
    /// indicate severe problems that make further compilation impossible or meaningless.
    ///
    /// * Code: `500`
    /// * Identifier: `"fatal"`
    /// * Display name: `"Fatal"`
    /// * Color: Red
    Fatal,

    /// Compilation error that prevents successful compilation.
    ///
    /// Standard compilation errors that indicate problems in the source code
    /// that must be fixed before the program can be successfully compiled.
    ///
    /// * Code: `400`
    /// * Identifier: `"error"`
    /// * Display name: `"Error"`
    /// * Color: Red
    Error,

    /// Warning about potential issues that don't prevent compilation.
    ///
    /// Indicates potentially problematic code patterns or suspicious constructs that might lead to
    /// bugs or unexpected behavior, but don't prevent the program from compiling.
    ///
    /// * Code: `300`
    /// * Identifier: `"warning"`
    /// * Display name: `"Warning"`
    /// * Color: Yellow
    Warning,

    /// Informational note providing additional context.
    ///
    /// Provides supplementary information, context, or explanations that help users understand
    /// other diagnostics or the compilation process.
    ///
    /// * Code: `200`
    /// * Identifier: `"note"`
    /// * Display name: `"Note"`
    /// * Color: Purple (Ansi256 color 147)
    Note,

    /// Low-level debugging information for development and troubleshooting.
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
    /// Returns an array of all severity variants.
    ///
    /// Provides access to all possible severity levels in a consistent order, typically used for
    /// iteration, validation, or exhaustiveness checking.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Severity;
    ///
    /// let all_severities = Severity::variants();
    /// assert_eq!(all_severities.len(), 6);
    /// assert_eq!(all_severities[0], Severity::Bug);
    /// assert_eq!(all_severities[5], Severity::Debug);
    /// ```
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

        &VARIANTS
    }

    /// Returns the complete metadata information for this severity level.
    ///
    /// Provides access to all static information associated with the severity, including
    /// identifier, code, name, description, and display color.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Severity;
    ///
    /// let info = Severity::Error.info();
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
                description: "A warning about potentially problematic code.",
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

    /// Returns any help messages associated with this severity level.
    ///
    /// Some severity levels provide built-in help messages that offer guidance on how to address or
    /// understand issues at that level.
    pub(crate) const fn messages(self) -> &'static [Message] {
        match self {
            Self::Bug => {
                const {
                    &[
                        Message::help(
                            "This is a bug in the compiler, not an issue with your code.",
                        )
                        .with_color(Color::Ansi(anstyle::AnsiColor::Green)),
                        Message::help(
                            "Please report this issue along with a minimal code example that \
                             reproduces the error.",
                        )
                        .with_color(Color::Ansi(anstyle::AnsiColor::Blue)),
                        Message::note(
                            "Internal compiler errors indicate a bug in the compiler itself that \
                             needs to be fixed.\n\nWe would appreciate if you could file a GitHub \
                             or Linear issue and reference this error.\n\nWhen reporting this \
                             issue, please include your query, any relevant type definitions, and \
                             the complete error message shown above.",
                        ),
                    ] as &[_]
                }
            }
            Self::Fatal | Self::Error | Self::Warning | Self::Note | Self::Debug => &[],
        }
    }

    /// Returns the string identifier for this severity level.
    ///
    /// The identifier is a short, unique string used for programmatic identification and
    /// serialization.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Severity;
    ///
    /// assert_eq!(Severity::Error.id(), "error");
    /// assert_eq!(Severity::Warning.id(), "warning");
    /// assert_eq!(Severity::Bug.id(), "ice");
    /// ```
    #[must_use]
    pub const fn id(self) -> &'static str {
        self.info().id
    }

    /// Returns the numeric code for this severity level.
    ///
    /// Higher codes indicate more severe issues. Codes >= 400 are considered
    /// critical and prevent successful compilation.
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

    /// Returns the human-readable display name for this severity level.
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

    /// Returns the ANSI color used for displaying this severity level.
    ///
    /// # Examples
    ///
    /// ```
    /// use anstyle::{AnsiColor, Color};
    /// use hashql_diagnostics::Severity;
    ///
    /// assert_eq!(Severity::Error.color(), Color::Ansi(AnsiColor::Red));
    /// assert_eq!(Severity::Warning.color(), Color::Ansi(AnsiColor::Yellow));
    /// ```
    #[must_use]
    pub const fn color(self) -> Color {
        self.info().color
    }

    /// Returns the ariadne report kind for this severity level.
    ///
    /// Used internally when generating diagnostic reports for display.
    pub(crate) fn kind(self) -> ariadne::ReportKind<'static> {
        ariadne::ReportKind::Custom(self.name(), anstyle_yansi::to_yansi_color(self.color()))
    }
}

impl const SeverityKind for Severity {
    fn is_critical(self) -> bool {
        self.code() >= 400
    }

    fn is_advisory(self) -> bool {
        !self.is_critical()
    }
}

impl Ord for Severity {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.code().cmp(&other.code())
    }
}

impl PartialOrd for Severity {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
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
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(self.name(), fmt)
    }
}

/// A severity level that is guaranteed to be critical (fatal).
///
/// [`Critical`] is a wrapper around [`Severity`] that provides compile-time guarantees that the
/// contained severity represents a critical issue that prevents successful compilation. This type
/// safety helps prevent bugs where non-critical severities are treated as critical.
///
/// Critical severities correspond to severity codes >= 400 and include:
/// - [`Critical::BUG`] (Internal Compiler Error)
/// - [`Critical::FATAL`] (Fatal Error)
/// - [`Critical::ERROR`] (Compilation Error)
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Severity, severity::Critical};
///
/// // Create from known critical severities
/// let critical_error = Critical::ERROR;
/// let critical_bug = Critical::BUG;
///
/// // Try to create from arbitrary severity
/// let maybe_critical = Critical::try_new(Severity::Error);
/// assert!(maybe_critical.is_some());
///
/// let not_critical = Critical::try_new(Severity::Warning);
/// assert!(not_critical.is_none());
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct Critical(Severity);

impl Critical {
    /// Pre-constructed critical severity for internal compiler errors.
    pub const BUG: Self = Self(Severity::Bug);
    /// Pre-constructed critical severity for compilation errors.
    pub const ERROR: Self = Self(Severity::Error);
    /// Pre-constructed critical severity for fatal errors.
    pub const FATAL: Self = Self(Severity::Fatal);

    /// Creates a critical severity without runtime checks.
    ///
    /// This is an internal method used when the severity is known to be critical
    /// at compile time. Debug builds will assert that the severity is actually critical.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `severity.is_critical()` returns `true`.
    pub(crate) const fn new_unchecked(severity: Severity) -> Self {
        debug_assert!(severity.is_critical());

        Self(severity)
    }

    /// Attempts to create a critical severity from a general severity.
    ///
    /// Returns [`Some`] if the provided severity is critical (code >= 400),
    /// or [`None`] if it's advisory.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Severity, severity::Critical};
    ///
    /// // Critical severities succeed
    /// assert!(Critical::try_new(Severity::Error).is_some());
    /// assert!(Critical::try_new(Severity::Fatal).is_some());
    /// assert!(Critical::try_new(Severity::Bug).is_some());
    ///
    /// // Advisory severities fail
    /// assert!(Critical::try_new(Severity::Warning).is_none());
    /// assert!(Critical::try_new(Severity::Note).is_none());
    /// assert!(Critical::try_new(Severity::Debug).is_none());
    /// ```
    #[must_use]
    pub const fn try_new(severity: Severity) -> Option<Self> {
        if severity.is_critical() {
            Some(Self(severity))
        } else {
            None
        }
    }
}

impl const SeverityKind for Critical {
    fn is_critical(self) -> bool {
        true
    }

    fn is_advisory(self) -> bool {
        false
    }
}

impl Display for Critical {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.0, f)
    }
}

impl Ord for Critical {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.0.cmp(&other.0)
    }
}

impl PartialOrd for Critical {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl const From<Critical> for Severity {
    fn from(severity: Critical) -> Self {
        severity.0
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for Critical {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.0.serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for Critical {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Severity::deserialize(deserializer).map(Self)
    }
}

/// A severity level that is guaranteed to be advisory (non-fatal).
///
/// [`Advisory`] is a wrapper around [`Severity`] that provides compile-time guarantees that the
/// contained severity represents a non-critical issue that doesn't prevent successful compilation.
/// This type safety helps organize diagnostic handling and ensures critical issues are handled
/// appropriately.
///
/// Advisory severities correspond to severity codes < 400 and include:
/// - [`Advisory::WARNING`] (Warning)
/// - [`Advisory::NOTE`] (Informational Note)
/// - [`Advisory::DEBUG`] (Debug Information)
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Severity, severity::Advisory};
///
/// // Create from known advisory severities
/// let advisory_warning = Advisory::WARNING;
/// let advisory_note = Advisory::NOTE;
///
/// // Try to create from arbitrary severity
/// let maybe_advisory = Advisory::try_new(Severity::Warning);
/// assert!(maybe_advisory.is_some());
///
/// let not_advisory = Advisory::try_new(Severity::Error);
/// assert!(not_advisory.is_none());
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct Advisory(Severity);

impl Advisory {
    /// Pre-constructed advisory severity for debug information.
    pub const DEBUG: Self = Self(Severity::Debug);
    /// Pre-constructed advisory severity for informational notes.
    pub const NOTE: Self = Self(Severity::Note);
    /// Pre-constructed advisory severity for warnings.
    pub const WARNING: Self = Self(Severity::Warning);

    /// Creates an advisory severity without runtime checks.
    ///
    /// This is an internal method used when the severity is known to be advisory
    /// at compile time. Debug builds will assert that the severity is actually advisory.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `severity.is_advisory()` returns `true`.
    pub(crate) const fn new_unchecked(severity: Severity) -> Self {
        debug_assert!(severity.is_advisory());

        Self(severity)
    }

    /// Attempts to create an advisory severity from a general severity.
    ///
    /// Returns [`Some`] if the provided severity is advisory (code < 400),
    /// or [`None`] if it's critical.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Severity, severity::Advisory};
    ///
    /// // Advisory severities succeed
    /// assert!(Advisory::try_new(Severity::Warning).is_some());
    /// assert!(Advisory::try_new(Severity::Note).is_some());
    /// assert!(Advisory::try_new(Severity::Debug).is_some());
    ///
    /// // Critical severities fail
    /// assert!(Advisory::try_new(Severity::Error).is_none());
    /// assert!(Advisory::try_new(Severity::Fatal).is_none());
    /// assert!(Advisory::try_new(Severity::Bug).is_none());
    /// ```
    #[must_use]
    pub const fn try_new(severity: Severity) -> Option<Self> {
        if severity.is_advisory() {
            Some(Self(severity))
        } else {
            None
        }
    }
}

impl const SeverityKind for Advisory {
    fn is_critical(self) -> bool {
        false
    }

    fn is_advisory(self) -> bool {
        true
    }
}

impl Display for Advisory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.0, f)
    }
}

impl Ord for Advisory {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.0.cmp(&other.0)
    }
}

impl PartialOrd for Advisory {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl const From<Advisory> for Severity {
    fn from(severity: Advisory) -> Self {
        severity.0
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for Advisory {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.0.serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for Advisory {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Severity::deserialize(deserializer).map(Self)
    }
}
