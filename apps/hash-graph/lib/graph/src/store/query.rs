mod filter;
mod path;

use std::fmt;

pub use self::{
    filter::{Filter, FilterExpression, Parameter, ParameterConversionError},
    path::{JsonPath, PathToken},
};

pub trait QueryPath {
    /// Returns what type this resolved `Path` has.
    fn expected_type(&self) -> ParameterType;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ParameterType {
    Boolean,
    Number,
    OntologyTypeVersion,
    Text,
    Uuid,
    BaseUrl,
    VersionedUrl,
    TimeInterval,
    Any,
}

impl fmt::Display for ParameterType {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Boolean => fmt.write_str("boolean"),
            Self::Number => fmt.write_str("number"),
            Self::OntologyTypeVersion => fmt.write_str("ontology type version"),
            Self::Text => fmt.write_str("text"),
            Self::Uuid => fmt.write_str("UUID"),
            Self::BaseUrl => fmt.write_str("base URL"),
            Self::VersionedUrl => fmt.write_str("versioned URL"),
            Self::TimeInterval => fmt.write_str("time interval"),
            Self::Any => fmt.write_str("any"),
        }
    }
}

pub trait OntologyQueryPath {
    /// Returns the path identifying the [`BaseUrl`].
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    fn base_url() -> Self;

    /// Returns the path identifying the [`VersionedUrl`].
    ///
    /// [`VersionedUrl`]: type_system::url::VersionedUrl
    fn versioned_url() -> Self;

    /// Returns the path identifying the [`OntologyTypeVersion`].
    ///
    /// [`OntologyTypeVersion`]: crate::identifier::ontology::OntologyTypeVersion
    fn version() -> Self;

    /// Returns the path identifying the transaction time.
    fn transaction_time() -> Self;

    /// Returns the path identifying the [`RecordCreatedById`].
    ///
    /// [`RecordCreatedById`]: crate::provenance::RecordCreatedById
    fn record_created_by_id() -> Self;

    /// Returns the path identifying the schema.
    fn schema() -> Self;

    /// Returns the path identifying the metadata
    fn additional_metadata() -> Self;
}
