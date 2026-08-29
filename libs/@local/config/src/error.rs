use core::{error::Error, fmt};

use error_stack::Report;
use figment::error::{Actual, Error as FigmentError, Kind as FigmentKind};

/// What prevented a configuration from loading.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum LoadError {
    /// The merged values do not deserialize into the requested configuration type.
    Invalid,
}

impl fmt::Display for LoadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid => formatter.write_str("the configuration could not be loaded"),
        }
    }
}

impl Error for LoadError {}

#[derive(Debug)]
struct LoadDiagnostic {
    provider: Option<String>,
    location: Option<String>,
    path: Option<Box<str>>,
    kind: LoadDiagnosticKind,
}

impl From<FigmentError> for LoadDiagnostic {
    fn from(error: FigmentError) -> Self {
        // Each provider renders paths in the notation of its own source, so a file layer reports
        // `store.port` where an environment layer reports the variable it read.
        let path = (!error.path.is_empty()).then(|| {
            match (&error.metadata, &error.profile) {
                (Some(metadata), Some(profile)) => metadata.interpolate(profile, &error.path),
                _ => error.path.join("."),
            }
            .into_boxed_str()
        });

        // A missing field is reported against its parent, so the two join into the whole key.
        let (kind, path) = match (LoadDiagnosticKind::from(error.kind), path) {
            (LoadDiagnosticKind::MissingField(field), Some(parent)) => (
                LoadDiagnosticKind::MissingField(format!("{parent}.{field}").into_boxed_str()),
                None,
            ),
            (kind, path) => (kind, path),
        };

        let (provider, location) = error.metadata.map_or((None, None), |metadata| {
            (
                Some(metadata.name.into_owned()),
                metadata.source.map(|source| source.to_string()),
            )
        });

        Self {
            provider,
            location,
            path,
            kind,
        }
    }
}

impl fmt::Display for LoadDiagnostic {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.kind.fmt(formatter)?;

        if let Some(path) = &self.path {
            write!(formatter, " at `{path}`")?;
        }

        if let Some(provider) = &self.provider {
            write!(formatter, " in `{provider}`")?;
        }

        if let Some(location) = &self.location {
            write!(formatter, " ({location})")?;
        }

        Ok(())
    }
}

#[derive(Debug)]
enum LoadDiagnosticKind {
    Opaque,
    InvalidType {
        actual: &'static str,
        expected: Box<str>,
    },
    InvalidValue {
        actual: &'static str,
        expected: Box<str>,
    },
    InvalidLength {
        expected: Box<str>,
    },
    UnknownVariant {
        expected: &'static [&'static str],
    },
    UnknownField {
        field: Box<str>,
        expected: &'static [&'static str],
    },
    MissingField(Box<str>),
    DuplicateField(&'static str),
    OutOfRange {
        actual: &'static str,
    },
    UnsupportedType(&'static str),
    UnsupportedKeyType {
        actual: &'static str,
        expected: Box<str>,
    },
}

impl From<FigmentKind> for LoadDiagnosticKind {
    fn from(kind: FigmentKind) -> Self {
        match kind {
            // A custom message is written by hand and may quote the value it rejected.
            FigmentKind::Message(_) => Self::Opaque,
            FigmentKind::InvalidType(actual, expected) => Self::InvalidType {
                actual: actual_kind(&actual),
                expected: expected.into_boxed_str(),
            },
            FigmentKind::InvalidValue(actual, expected) => Self::InvalidValue {
                actual: actual_kind(&actual),
                expected: expected.into_boxed_str(),
            },
            // The measured length is derived from the value it measured.
            FigmentKind::InvalidLength(_, expected) => Self::InvalidLength {
                expected: expected.into_boxed_str(),
            },
            // A variant name is a configured value rather than a key.
            FigmentKind::UnknownVariant(_, expected) => Self::UnknownVariant { expected },
            FigmentKind::UnknownField(field, expected) => Self::UnknownField {
                field: field.into_boxed_str(),
                expected,
            },
            FigmentKind::MissingField(field) => Self::MissingField(field.into()),
            FigmentKind::DuplicateField(field) => Self::DuplicateField(field),
            FigmentKind::ISizeOutOfRange(_) => Self::OutOfRange {
                actual: "signed integer",
            },
            FigmentKind::USizeOutOfRange(_) => Self::OutOfRange {
                actual: "unsigned integer",
            },
            FigmentKind::Unsupported(actual) => Self::UnsupportedType(actual_kind(&actual)),
            FigmentKind::UnsupportedKey(actual, expected) => Self::UnsupportedKeyType {
                actual: actual_kind(&actual),
                expected: expected.into(),
            },
        }
    }
}

impl fmt::Display for LoadDiagnosticKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Opaque => formatter.write_str("the configuration data is invalid"),
            Self::InvalidType { actual, expected } => {
                write!(
                    formatter,
                    "invalid type: found {actual}, expected {expected}"
                )
            }
            Self::InvalidValue { actual, expected } => {
                write!(
                    formatter,
                    "invalid value: found {actual}, expected {expected}"
                )
            }
            Self::InvalidLength { expected } => {
                write!(formatter, "invalid length, expected {expected}")
            }
            Self::UnknownVariant { expected } => {
                formatter.write_str("unknown variant, expected one of ")?;
                write_expected(formatter, expected)
            }
            Self::UnknownField { field, expected } => {
                write!(formatter, "unknown field `{field}`, expected one of ")?;
                write_expected(formatter, expected)
            }
            Self::MissingField(field) => write!(formatter, "missing field `{field}`"),
            Self::DuplicateField(field) => write!(formatter, "duplicate field `{field}`"),
            Self::OutOfRange { actual } => write!(formatter, "{actual} is out of range"),
            Self::UnsupportedType(actual) => {
                write!(formatter, "unsupported type `{actual}`")
            }
            Self::UnsupportedKeyType { actual, expected } => {
                write!(
                    formatter,
                    "unsupported key type `{actual}`, expected `{expected}`"
                )
            }
        }
    }
}

fn write_expected(formatter: &mut fmt::Formatter<'_>, expected: &[&str]) -> fmt::Result {
    for (index, value) in expected.iter().enumerate() {
        if index > 0 {
            formatter.write_str(", ")?;
        }
        write!(formatter, "`{value}`")?;
    }
    Ok(())
}

const fn actual_kind(actual: &Actual) -> &'static str {
    match actual {
        Actual::Bool(_) => "boolean",
        Actual::Unsigned(_) => "unsigned integer",
        Actual::Signed(_) => "signed integer",
        Actual::Float(_) => "floating-point number",
        Actual::Char(_) => "character",
        Actual::Str(_) => "string",
        Actual::Bytes(_) => "bytes",
        Actual::Unit => "unit",
        Actual::Option => "option",
        Actual::NewtypeStruct => "newtype struct",
        Actual::Seq => "sequence",
        Actual::Map => "map",
        Actual::Enum => "enum",
        Actual::UnitVariant => "unit variant",
        Actual::NewtypeVariant => "newtype variant",
        Actual::TupleVariant => "tuple variant",
        Actual::StructVariant => "struct variant",
        Actual::Other(_) => "other",
    }
}

#[track_caller]
pub(crate) fn load_report(error: FigmentError) -> Report<LoadError> {
    let mut report = Report::new(LoadError::Invalid);
    for error in error {
        report = report.attach(LoadDiagnostic::from(error));
    }
    report
}
