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
    UnsignedInteger,
    Text,
    Uuid,
    BaseUri,
    VersionedUri,
    TimeInterval,
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
            Self::TimeInterval => fmt.write_str("time interval"),
            Self::Any => fmt.write_str("any"),
        }
    }
}

pub trait OntologyQueryPath {
    /// Returns the path identifying the [`BaseUri`].
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    fn base_uri() -> Self;

    /// Returns the path identifying the [`VersionedUri`].
    ///
    /// [`VersionedUri`]: type_system::uri::VersionedUri
    fn versioned_uri() -> Self;

    /// Returns the path identifying the [`OntologyTypeVersion`].
    ///
    /// [`OntologyTypeVersion`]: crate::identifier::ontology::OntologyTypeVersion
    fn version() -> Self;

    /// Returns the path identifying the [`OwnedById`].
    ///
    /// [`OwnedById`]: crate::provenance::OwnedById
    fn owned_by_id() -> Self;

    /// Returns the path identifying the [`UpdatedById`].
    ///
    /// [`UpdatedById`]: crate::provenance::UpdatedById
    fn updated_by_id() -> Self;

    /// Returns the path identifying the schema.
    fn schema() -> Self;
}
