use core::time::Duration;
use std::{collections::HashMap, io};

use error_stack::{Report, ResultExt as _};
use futures::{StreamExt as _, TryStreamExt as _, stream};
use include_dir::{Dir, DirEntry, include_dir};
use reqwest::{
    Client,
    header::{ACCEPT, USER_AGENT},
};
use reqwest_middleware::ClientBuilder;
use reqwest_tracing::TracingMiddleware;
use tarpc::context::Context;
use time::OffsetDateTime;
use type_system::ontology::VersionedUrl;

use crate::fetcher::{FetchedOntologyType, Fetcher, FetcherError};

#[derive(Clone)]
pub struct FetchServer {
    pub buffer_size: usize,
    pub predefined_types: HashMap<VersionedUrl, FetchedOntologyType>,
}

const PREDEFINED_TYPES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/predefined_types");

impl FetchServer {
    /// Load predefined types from the `predefined_types` directory
    ///
    /// # Errors
    ///
    /// - If the predefined types directory cannot be found
    /// - If a predefined type cannot be deserialized
    #[tracing::instrument(skip(self))]
    pub fn load_predefined_types(&mut self) -> Result<(), Report<io::Error>> {
        for entry in PREDEFINED_TYPES.find("**/*.json").change_context_lazy(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "No JSON files in predefined types directory found",
            )
        })? {
            if let DirEntry::File(file) = entry {
                let ontology_type = serde_json::from_slice(file.contents())
                    .map_err(io::Error::from)
                    .attach_lazy(|| file.path().display().to_string())?;
                let id = match &ontology_type {
                    FetchedOntologyType::DataType(data_type) => data_type.id.clone(),
                    FetchedOntologyType::PropertyType(property_type) => property_type.id.clone(),
                    FetchedOntologyType::EntityType(entity_type) => entity_type.id.clone(),
                };
                self.predefined_types.insert(id, ontology_type);
            }
        }

        Ok(())
    }
}

impl Fetcher for FetchServer {
    #[tracing::instrument(skip(self, _context))]
    async fn fetch_ontology_types(
        mut self,
        _context: Context,
        ontology_type_urls: Vec<VersionedUrl>,
    ) -> Result<Vec<(FetchedOntologyType, OffsetDateTime)>, FetcherError> {
        self.load_predefined_types().map_err(|err| {
            FetcherError::PredefinedTypes(format!("Error loading predefined types: {err:?}"))
        })?;

        let client = ClientBuilder::new(Client::new())
            .with(TracingMiddleware::default())
            .build();
        let predefined_types = &self.predefined_types;
        stream::iter(ontology_type_urls)
            .map(|url| {
                let client = client.clone();
                async move {
                    let ontology_type = if let Some(ontology_type) = predefined_types.get(&url) {
                        ontology_type.clone()
                    } else {
                        client
                            .get(url.to_url())
                            .header(ACCEPT, "application/json")
                            .header(USER_AGENT, "HASH Graph")
                            .timeout(Duration::from_secs(10))
                            .send()
                            .await
                            .map_err(|err| {
                                tracing::error!(error=?err, %url, "Could not fetch ontology type");
                                FetcherError::Network(format!("Error fetching {url}: {err:?}"))
                            })?
                            .json::<FetchedOntologyType>()
                            .await
                            .map_err(|err| {
                                tracing::error!(error=?err, %url, "Could not deserialize response");
                                FetcherError::Serialization(format!(
                                    "Error deserializing {url}: {err:?}"
                                ))
                            })?
                    };

                    Ok::<_, FetcherError>((ontology_type, OffsetDateTime::now_utc()))
                }
            })
            .buffer_unordered(self.buffer_size)
            .try_collect()
            .await
    }
}
