use std::{error::Error, fmt};

use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use type_system::{repr, url::VersionedUrl};

// We would really like to use error-stack for this. It's not possible because
// we need Serialize and Deserialize for `Report`
#[derive(Debug, Serialize, Deserialize)]
pub enum FetcherError {
    NetworkError(String),
    SerializationError(String),
}

impl Error for FetcherError {}

impl fmt::Display for FetcherError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("the type fetcher encountered an error durlng execution: ")?;

        match self {
            Self::NetworkError(message) | Self::SerializationError(message) => {
                fmt.write_str(message)
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum OntologyTypeRepr {
    DataType(repr::DataType),
    PropertyType(repr::PropertyType),
    EntityType(repr::EntityType),
}

#[tarpc::service]
pub trait Fetcher {
    /// Fetch a list of ontology types identified by their [`VersionedUrl]` and returns them.
    async fn fetch_ontology_types(
        ontology_type_urls: Vec<VersionedUrl>,
    ) -> Result<Vec<(OntologyTypeRepr, OffsetDateTime)>, FetcherError>;
}
