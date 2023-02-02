use std::fmt;

use error_stack::Context;
use serde::{Deserialize, Serialize};
use type_system::repr::{DataType, EntityType, PropertyType};

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
            FetcherError::NetworkError(message)
            | FetcherError::SerializationError(message)
            | FetcherError::TypeParsingError(message) => fmt.write_str(message),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum FetchedOntologyType {
    EntityType(EntityType),
    PropertyType(PropertyType),
    DataType(DataType),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TypeFetchResponse {
    pub results: Vec<FetchedOntologyType>,
}

impl TypeFetchResponse {
    pub fn new(results: Vec<FetchedOntologyType>) -> Self {
        Self { results }
    }
}

#[tarpc::service]
pub trait Fetcher {
    /// Fetch an entity type by its URL and return all types that are reachable from it.
    async fn fetch_entity_type_exhaustive(
        entity_type_url: String,
    ) -> Result<TypeFetchResponse, FetcherError>;
}
