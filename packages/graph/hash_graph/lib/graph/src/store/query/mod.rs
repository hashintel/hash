mod filter;

use std::fmt;

pub use self::filter::{Filter, FilterExpression, Parameter, ParameterConversionError};

/// A record stored in the [`store`].
///
/// [`store`]: crate::store
pub trait QueryRecord {
    type Path<'q>: RecordPath;
}

pub trait RecordPath {
    /// Returns what type this resolved `Path` has.
    fn expected_type(&self) -> ParameterType;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ParameterType {
    Boolean,
    Number,
    UnsignedInteger,
    Text,
    Uuid,
    BaseUri,
    VersionedUri,
    Timestamp,
    Any,
}

impl fmt::Display for ParameterType {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Boolean => fmt.write_str("boolean"),
            Self::Number => fmt.write_str("number"),
            Self::UnsignedInteger => fmt.write_str("unsigned integer"),
            Self::Text => fmt.write_str("text"),
            Self::Uuid => fmt.write_str("UUID"),
            Self::BaseUri => fmt.write_str("base URI"),
            Self::VersionedUri => fmt.write_str("versioned URI"),
            Self::Timestamp => fmt.write_str("timestamp"),
            Self::Any => fmt.write_str("any"),
        }
    }
}

pub trait OntologyPath {
    /// Returns the path identifying the base URI.
    fn base_uri() -> Self;

    /// Returns the path identifying the versioned URI.
    fn versioned_uri() -> Self;

    /// Returns the path identifying the version
    fn version() -> Self;

    /// Returns the path identifying the title.
    fn title() -> Self;

    /// Returns the path identifying the description.
    fn description() -> Self;
}
