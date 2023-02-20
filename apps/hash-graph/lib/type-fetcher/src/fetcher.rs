use std::fmt;

use error_stack::Context;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use type_system::{repr, uri::VersionedUri};

// We would really like to use error-stack for this. It's not possible because
// we need Serialize and Deserialize for `Report`
#[derive(Debug, Serialize, Deserialize)]
pub enum FetcherError {
    NetworkError(String),
    SerializationError(String),
    TypeParsingError(String),
}
impl Context for FetcherError {}

impl fmt::Display for FetcherError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("the type fetcher encountered an error during execution: ")?;

        match self {
            Self::NetworkError(message)
            | Self::SerializationError(message)
            | Self::TypeParsingError(message) => fmt.write_str(message),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum OntologyType {
    EntityType(repr::EntityType),
    PropertyType(repr::PropertyType),
    DataType(repr::DataType),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FetchedOntologyType {
    pub ontology_type: OntologyType,
    pub fetched_at: OffsetDateTime,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TypeFetchResponse {
    pub results: Vec<FetchedOntologyType>,
}

impl TypeFetchResponse {
    #[must_use]
    pub fn new(results: Vec<FetchedOntologyType>) -> Self {
        Self { results }
    }
}

#[tarpc::service]
pub trait Fetcher {
    /// Fetch an ontology type by its URL and return all types that are reachable from it.
    async fn fetch_ontology_type_exhaustive(
        ontology_type_url: VersionedUri,
    ) -> Result<TypeFetchResponse, FetcherError>;
}
