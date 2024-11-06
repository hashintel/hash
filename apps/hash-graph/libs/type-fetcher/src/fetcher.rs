#![expect(clippy::future_not_send)]

use time::OffsetDateTime;
use type_system::{
    schema::{DataType, EntityType, PropertyType},
    url::VersionedUrl,
};

#[derive(Debug, serde::Serialize, serde::Deserialize, derive_more::Display, derive_more::Error)]
#[display("the type fetcher encountered an error during execution: {_variant}")]
#[must_use]
pub enum FetcherError {
    #[display("{_0}")]
    NetworkError(#[error(ignore)] String),
    #[display("{_0}")]
    SerializationError(#[error(ignore)] String),
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(untagged)]
pub enum FetchedOntologyType {
    DataType(DataType),
    PropertyType(PropertyType),
    EntityType(Box<EntityType>),
}

#[tarpc::service]
pub trait Fetcher {
    /// Fetch a list of ontology types identified by their [`VersionedUrl]` and returns them.
    async fn fetch_ontology_types(
        ontology_type_urls: Vec<VersionedUrl>,
    ) -> Result<Vec<(FetchedOntologyType, OffsetDateTime)>, FetcherError>;
}
